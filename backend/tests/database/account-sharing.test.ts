import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/core/database";
import { generateToken } from "../../src/modules/identity";
import { seedRulesets } from "../../src/modules/sharing";
import { encrypt } from "../../src/core/secrets";
import { registry } from "../../src/modules/integrations/adapters";
import { executeSync, submitSync } from "../../src/modules/integrations/sync";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"account, links, invitations and sync policy",
	() => {
		let app: Awaited<ReturnType<typeof buildApp>>;

		const admin = randomUUID(),
			friend = randomUUID();

		const users = [admin, friend];
		let calendarId: string;

		let original: Awaited<
			ReturnType<typeof prisma.appSettings.findUniqueOrThrow>
		>;

		const auth = (id = admin) => ({
			authorization: `Bearer ${generateToken(id)}`,
		});

		const send = (
			method: "POST" | "PATCH" | "DELETE",
			url: string,
			payload?: object,
			id = admin,
		) =>
			app.inject({
				method,
				url,
				headers: auth(id),
				...(payload ? { payload } : {}),
			});

		const register = (code?: string) =>
			app.inject({
				method: "POST",
				url: "/api/v1/auth/registrations",
				payload: {
					email: `${randomUUID()}@example.test`,
					password: "test-password",
					...(code ? { inviteCode: code } : {}),
				},
			});

		const preview = (url: string) =>
			app.inject({
				method: "POST",
				url: "/api/v1/shared-calendar-previews",
				payload: {
					token: new URL(url).hash.slice(1),
					start: "2026-10-01T00:00:00Z",
					end: "2026-11-01T00:00:00Z",
				},
			});

		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");

			app = await buildApp();

			original = await prisma.appSettings.upsert({
				where: { id: "global" },
				create: { id: "global" },
				update: {},
			});

			await prisma.appSettings.update({
				where: { id: "global" },
				data: {
					registrationsOpen: true,
					inviteOnly: false,
					requireEmailVerification: false,
					syncPastDays: 90,
					syncFutureDays: 365,
				},
			});

			await prisma.user.createMany({
				data: users.map((id) => ({
					id,
					email: `${id}@example.test`,
					passwordHash: "hash",
					isAdmin: id === admin,
					accountRole: id === admin ? "admin" : "normal",
				})),
			});

			await prisma.$transaction(async (tx) => {
				await seedRulesets(tx, admin);
				await seedRulesets(tx, friend);
			});

			await prisma.userSettings.create({
				data: {
					userId: admin,
					timezone: "Europe/Berlin",
					firstDayOfWeek: "sunday",
				},
			});

			await prisma.friendship.create({
				data: { user1Id: admin, user2Id: friend, status: "accepted" },
			});

			const connection = await prisma.connection.create({
				data: {
					userId: admin,
					type: "ics",
					name: "Test",
					credentials: encrypt({ url: "https://example.test/feed" }),
				},
			});

			const calendar = await prisma.calendar.create({
				data: {
					userId: admin,
					name: "Private name",
					type: "ics",
					syncInterval: 0,
					connectionId: connection.id,
					remoteId: "test",
				},
			});

			calendarId = calendar.id;

			await prisma.event.create({
				data: {
					calendarId,
					externalId: "private",
					title: "Secret planning",
					description: "Secret notes",
					startTime: new Date("2026-10-10T12:00:00Z"),
					endTime: new Date("2026-10-10T13:00:00Z"),
				},
			});
		});

		afterAll(async () => {
			vi.restoreAllMocks();

			await prisma.calendar.deleteMany({
				where: { userId: { in: users } },
			});

			await prisma.user.deleteMany({ where: { id: { in: users } } });
			await prisma.inviteCode.deleteMany({ where: { createdBy: admin } });
			const { id: _id, updatedAt: _updatedAt, ...settings } = original;

			await prisma.appSettings.update({
				where: { id: "global" },
				data: settings,
			});

			await app.close();
			await prisma.$disconnect();
		});

		it("uses admin defaults only for new or missing preferences", async () => {
			expect(
				(
					await send("PATCH", "/api/v1/admin/settings", {
						defaultTimezone: "Asia/Tokyo",
						defaultFirstDayOfWeek: "sunday",
					})
				).statusCode,
			).toBe(200);

			const created = await register();
			users.push(created.json().id);
			expect(created.statusCode).toBe(201);

			expect(
				await prisma.userSettings.findUnique({
					where: { userId: created.json().id },
				}),
			).toMatchObject({
				timezone: "Asia/Tokyo",
				firstDayOfWeek: "sunday",
			});

			expect(
				(
					await app.inject({
						url: "/api/v1/me/settings",
						headers: auth(friend),
					})
				).json(),
			).toMatchObject({ timezone: "Asia/Tokyo" });

			expect(
				(
					await app.inject({
						url: "/api/v1/me/settings",
						headers: auth(),
					})
				).json(),
			).toMatchObject({ timezone: "Europe/Berlin" });

			expect(
				(
					await send("PATCH", "/api/v1/admin/settings", {
						defaultTimezone: "Invalid/Zone",
					})
				).statusCode,
			).toBe(400);

			expect(
				(
					await send("PATCH", "/api/v1/admin/settings", {
						syncPastDays: 0,
						syncFutureDays: 0,
					})
				).statusCode,
			).toBe(400);
		});

		it("manages multiple invitations and consumes a code once even during open registration", async () => {
			const first = await send("POST", "/api/v1/invitations", {
				label: "One",
			});

			const second = await send("POST", "/api/v1/invitations", {
				label: "Two",
				expiresAt: null,
			});

			expect(first.statusCode, first.body).toBe(201);
			expect(second.statusCode).toBe(201);

			expect(new URL(first.json().registrationUrl).hash).toBe(
				`#invite=${first.json().code}`,
			);

			expect(
				(
					await app.inject({
						url: "/api/v1/invitations",
						headers: auth(),
					})
				).json().items.length,
			).toBeGreaterThanOrEqual(2);

			const responses = await Promise.all([
				register(first.json().code),
				register(first.json().code),
			]);

			expect(responses.map((r) => r.statusCode).sort()).toEqual([
				201, 403,
			]);

			users.push(responses.find((r) => r.statusCode === 201)!.json().id);
			await send("DELETE", `/api/v1/invitations/${second.json().id}`);

			expect((await register(second.json().code)).json().code).toBe(
				"INVITE_INVALID",
			);

			expect(
				(
					await app.inject({
						url: "/api/v1/invitations",
						headers: auth(friend),
					})
				).statusCode,
			).toBe(403);

			expect(
				(await send("POST", "/api/v1/invitations", {}, friend))
					.statusCode,
			).toBe(403);

			const third = (
				await send("POST", "/api/v1/invitations", {})
			).json();

			await prisma.appSettings.update({
				where: { id: "global" },
				data: { registrationsOpen: false },
			});

			expect((await register(third.code)).json().code).toBe(
				"REGISTRATION_CLOSED",
			);

			expect(
				(
					await prisma.inviteCode.findUniqueOrThrow({
						where: { id: third.id },
					})
				).usedAt,
			).toBeNull();

			await prisma.appSettings.update({
				where: { id: "global" },
				data: { registrationsOpen: true },
			});

			await prisma.inviteCode.update({
				where: { id: third.id },
				data: { expiresAt: new Date(0) },
			});

			expect((await register(third.code)).json().code).toBe(
				"INVITE_INVALID",
			);
		});

		it("applies independent mutable ABAC link policies with anonymous context", async () => {
			const rule = await prisma.permissionRuleset.create({
				data: {
					userId: admin,
					name: "Public",
					fallback: "busy",
					rules: [
						{
							when: {
								attribute: "friend.email",
								operator: "contains",
								value: "@",
							},
							visibility: "full",
						},
					],
				},
			});

			const full = await prisma.permissionRuleset.findFirstOrThrow({
				where: { userId: admin, seedKey: "full" },
			});

			const privateRule = await prisma.permissionRuleset.findFirstOrThrow(
				{ where: { userId: friend } },
			);

			expect(
				(
					await send(
						"POST",
						`/api/v1/calendars/${calendarId}/subscriptions`,
						{ rulesetId: privateRule.id },
					)
				).statusCode,
			).toBe(404);

			const one = (
				await send(
					"POST",
					`/api/v1/calendars/${calendarId}/subscriptions`,
					{ name: "Public", rulesetId: rule.id },
				)
			).json();

			const two = (
				await send(
					"POST",
					`/api/v1/calendars/${calendarId}/subscriptions`,
					{ name: "Trusted", rulesetId: full.id },
				)
			).json();

			const response = await preview(one.previewUrl);
			expect(response.statusCode, response.body).toBe(200);
			const before = response.json();
			expect(before.items[0].title).toBe("Busy");
			expect(before.timezone).toBe("Europe/Berlin");
			expect(before.firstDayOfWeek).toBe("sunday");

			expect((await preview(two.previewUrl)).json().items[0].title).toBe(
				"Secret planning",
			);

			expect(
				(await send("DELETE", `/api/v1/rulesets/${rule.id}`)).json()
					.code,
			).toBe("RULESET_IN_USE");

			await prisma.permissionRuleset.update({
				where: { id: rule.id },
				data: { fallback: "hidden", version: { increment: 1 } },
			});

			const after = (await preview(one.previewUrl)).json();
			expect(after.items).toEqual([]);
			expect(after.accessRevision).not.toBe(before.accessRevision);

			expect(
				(await app.inject(new URL(one.url).pathname)).body,
			).not.toContain("Secret planning");

			await send("PATCH", `/api/v1/subscriptions/${one.id}`, {
				name: "Changed",
				rulesetId: full.id,
			});

			expect((await preview(one.previewUrl)).json().items[0].title).toBe(
				"Secret planning",
			);

			await send("DELETE", `/api/v1/subscriptions/${one.id}`);
			expect((await preview(one.previewUrl)).statusCode).toBe(404);
			expect((await preview(two.previewUrl)).statusCode).toBe(200);

			expect(
				(await send("DELETE", `/api/v1/rulesets/${rule.id}`))
					.statusCode,
			).toBe(204);
		});

		it("restricts friend-issued ABAC links to the current grant and revokes them with it", async () => {
			const busy = await prisma.permissionRuleset.findFirstOrThrow({
				where: { userId: admin, seedKey: "busy" },
			});

			const full = await prisma.permissionRuleset.findFirstOrThrow({
				where: { userId: friend, seedKey: "full" },
			});

			await prisma.calendarShare.create({
				data: {
					calendarId,
					sharedWithId: friend,
					permission: "full",
					rulesetId: busy.id,
				},
			});

			const created = await send(
				"POST",
				`/api/v1/calendars/${calendarId}/subscriptions`,
				{
					name: "Friend audience",
					rulesetId: full.id,
				},
				friend,
			);

			expect(created.statusCode, created.body).toBe(201);
			const link = created.json();

			expect((await preview(link.previewUrl)).json().items[0].title).toBe(
				"Busy",
			);

			expect(
				(await app.inject(new URL(link.url).pathname)).body,
			).not.toContain("Secret planning");

			await prisma.permissionRuleset.update({
				where: { id: busy.id },
				data: { fallback: "hidden" },
			});

			expect((await preview(link.previewUrl)).json().items).toEqual([]);

			await prisma.calendarShare.deleteMany({
				where: { calendarId, sharedWithId: friend },
			});

			expect((await preview(link.previewUrl)).statusCode).toBe(403);

			expect(
				(await app.inject(new URL(link.url).pathname)).statusCode,
			).toBe(403);
		});

		it("prunes only after complete covered syncs and requeues changed policy", async () => {
			const now = Date.now();

			await prisma.event.create({
				data: {
					calendarId,
					externalId: "old",
					title: "Old",
					startTime: new Date(now - 500 * 86400000),
					endTime: new Date(now - 499 * 86400000),
				},
			});

			const fetch = vi
				.spyOn(registry.ics, "fetch")
				.mockImplementation(async (_c, _id, _tz, coverage) => ({
					kind: "snapshot",
					complete: false,
					coverage,
					events: [],
				}));

			const first = await submitSync(calendarId);
			await executeSync(first.id);

			expect(
				(
					await prisma.syncRun.findUniqueOrThrow({
						where: { id: first.id },
					})
				).status,
			).toBe("failed");

			expect(
				await prisma.event.count({
					where: { calendarId, externalId: "old" },
				}),
			).toBe(1);

			fetch.mockImplementation(async (_c, _id, _tz, coverage) => {
				await prisma.appSettings.update({
					where: { id: "global" },
					data: { syncFutureDays: 366 },
				});

				return {
					kind: "snapshot",
					complete: true,
					coverage,
					events: [],
				};
			});

			const second = await submitSync(calendarId);
			await executeSync(second.id);

			expect(
				(
					await prisma.syncRun.findUniqueOrThrow({
						where: { id: second.id },
					})
				).status,
			).toBe("queued");

			expect(
				await prisma.event.count({
					where: { calendarId, externalId: "old" },
				}),
			).toBe(1);

			fetch.mockImplementation(async (_c, _id, _tz, coverage) => ({
				kind: "snapshot",
				complete: true,
				coverage,
				events: [],
			}));

			await executeSync(second.id);
			expect(await prisma.event.count({ where: { calendarId } })).toBe(0);

			expect(
				(
					await prisma.calendar.findUniqueOrThrow({
						where: { id: calendarId },
					})
				).syncInterval,
			).toBe(0);

			fetch.mockRestore();
		});

		it("clears history and errors without deleting active jobs or successful timestamps", async () => {
			const calendar = await prisma.calendar.update({
				where: { id: calendarId },
				data: { lastError: "Old error" },
			});

			const pending = await submitSync(calendarId);

			expect(
				(
					await send(
						"DELETE",
						"/api/v1/admin/sync-runs",
						undefined,
						friend,
					)
				).statusCode,
			).toBe(403);

			const cleared = await send("DELETE", "/api/v1/admin/sync-runs");
			expect(cleared.statusCode).toBe(200);
			expect(cleared.json().clearedErrors).toBeGreaterThan(0);

			expect(
				(
					await prisma.syncRun.findUniqueOrThrow({
						where: { id: pending.id },
					})
				).status,
			).toBe("queued");

			const after = await prisma.calendar.findUniqueOrThrow({
				where: { id: calendarId },
			});

			expect(after.lastError).toBeNull();
			expect(after.lastSuccess).toEqual(calendar.lastSuccess);
			expect(after.lastAttempt).toEqual(calendar.lastAttempt);
		});
	},
);
