import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/core/database";

vi.mock("../../src/core/mail", () => ({ mailConfigured: () => false }));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"main feature compatibility through REST v1",
	() => {
		let app: Awaited<ReturnType<typeof buildApp>>;

		const accounts: Array<{
			id: string;
			email: string;
			name: string;
			token: string;
		}> = [];

		const password = "parity-account-password";
		const prefix = randomUUID();
		let address = 1;

		const call = (
			method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
			path: string,
			actor = 0,
			payload?: object,
		) =>
			app.inject({
				method,
				url: `/api/v1${path}`,
				payload,
				remoteAddress: `198.51.100.${address++}`,
				headers: accounts[actor]?.token
					? { authorization: `Bearer ${accounts[actor].token}` }
					: {},
			});

		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");

			await prisma.appSettings.upsert({
				where: { id: "global" },
				create: { id: "global" },
				update: {
					registrationsOpen: true,
					inviteOnly: false,
					requireEmailVerification: false,
					requireTwoFactor: false,
				},
			});

			app = await buildApp();

			for (const suffix of ["owner", "friend", "outsider"]) {
				const email = `${prefix}-${suffix}@example.test`,
					name = `${prefix}-${suffix}`;

				const registered = await call(
					"POST",
					"/auth/registrations",
					-1,
					{ email, name, password },
				);

				expect(registered.statusCode, registered.body).toBe(201);

				const login = await call("POST", "/auth/sessions", -1, {
					email,
					password,
				});

				expect(login.statusCode, login.body).toBe(200);

				accounts.push({
					id: registered.json().id,
					email,
					name,
					token: login.json().token,
				});
			}
		});

		afterAll(async () => {
			await prisma.calendar.deleteMany({
				where: { userId: { in: accounts.map((row) => row.id) } },
			});

			await prisma.user.deleteMany({
				where: { id: { in: accounts.map((row) => row.id) } },
			});

			await app?.close();
			await prisma.$disconnect();
		});

		it("persists profile name and all existing preferences, and validates password changes", async () => {
			expect(
				(await call("PATCH", "/me", 0, { name: "Updated owner" }))
					.statusCode,
			).toBe(200);

			const settings = {
				firstDayOfWeek: "sunday",
				timezone: "Europe/London",
				defaultTab: "calendar",
			};

			expect(
				(await call("PATCH", "/me/settings", 0, settings)).statusCode,
			).toBe(200);

			expect((await call("GET", "/me")).json().name).toBe(
				"Updated owner",
			);

			expect((await call("GET", "/me/settings")).json()).toMatchObject(
				settings,
			);

			expect(
				(
					await call("PUT", "/me/password", 0, {
						currentPassword: "wrong-password",
						newPassword: "replacement-password",
					})
				).statusCode,
			).toBe(403);

			expect((await call("GET", "/me")).statusCode).toBe(200);
		});

		it("finds friends by name and supports requesting by email, name, or user ID", async () => {
			const search = await call(
				"GET",
				`/users?query=${encodeURIComponent(accounts[1].name)}`,
			);

			expect(
				search.json().items.map((row: { id: string }) => row.id),
			).toContain(accounts[1].id);

			for (const payload of [
				{ identifier: accounts[1].email.toUpperCase() },
				{ identifier: accounts[1].name },
				{ targetUserId: accounts[1].id },
			]) {
				const requested = await call(
					"POST",
					"/friendships",
					0,
					payload,
				);

				expect(requested.statusCode, requested.body).toBe(201);
				const path = `/friendships/${requested.json().id}`;

				expect(
					(await call("POST", "/friendships", 0, payload)).statusCode,
				).toBe(409);

				expect(
					(await call("PATCH", path, 2, { status: "accepted" }))
						.statusCode,
				).toBe(404);

				expect(
					(await call("PATCH", path, 1, { status: "accepted" }))
						.statusCode,
				).toBe(200);

				expect(
					(await call("GET", "/friendships", 1)).json().items,
				).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							id: requested.json().id,
							status: "accepted",
						}),
					]),
				);

				expect((await call("DELETE", path, 2)).statusCode).toBe(404);
				expect((await call("DELETE", path, 1)).statusCode).toBe(204);
			}

			expect(
				(
					await call("POST", "/friendships", 0, {
						targetUserId: accounts[0].id,
					})
				).statusCode,
			).toBe(409);
		});

		it("renames calendars, preserves manual sync, masks all original sharing levels, and removes shares with friendships", async () => {
			const calendar = await prisma.calendar.create({
				data: {
					userId: accounts[0].id,
					name: "Original",
					type: "ics",
					syncInterval: 0,
				},
			});

			await prisma.event.create({
				data: {
					calendarId: calendar.id,
					externalId: "parity-event",
					title: "Private meeting",
					description: "Private notes",
					location: "Private room",
					startTime: new Date("2026-10-20T10:00Z"),
					endTime: new Date("2026-10-20T11:00Z"),
				},
			});

			expect(
				(
					await call("PATCH", `/calendars/${calendar.id}`, 0, {
						name: "Renamed",
						syncInterval: 0,
					})
				).statusCode,
			).toBe(200);

			expect((await call("GET", "/calendars")).json().items).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						id: calendar.id,
						name: "Renamed",
						syncInterval: 0,
						eventCount: 1,
					}),
				]),
			);

			expect(
				(await call("DELETE", `/calendars/${calendar.id}`, 2))
					.statusCode,
			).toBe(403);

			const friendship = (
				await call("POST", "/friendships", 0, {
					targetUserId: accounts[1].id,
				})
			).json();

			await call("PATCH", `/friendships/${friendship.id}`, 1, {
				status: "accepted",
			});

			const rulesets = (await call("GET", "/rulesets")).json().items;
			const query = `/events?scope=shared&start=2026-10-20T00:00:00Z&end=2026-10-21T00:00:00Z`;

			for (const permission of ["busy", "titles", "full"]) {
				const ruleset = rulesets.find(
					(row: { fallback: string }) => row.fallback === permission,
				);

				expect(
					(
						await call(
							"PUT",
							`/calendars/${calendar.id}/grants/${accounts[1].id}`,
							0,
							{ rulesetId: ruleset.id },
						)
					).statusCode,
				).toBe(204);

				const event = (await call("GET", query, 1)).json().items[0];

				expect(event.title).toBe(
					permission === "busy" ? "Busy" : "Private meeting",
				);

				expect(event.description).toBe(
					permission === "full" ? "Private notes" : null,
				);

				expect(event.location).toBe(
					permission === "full" ? "Private room" : null,
				);

				expect(event.startTime).toBe("2026-10-20T10:00:00.000Z");
			}

			expect((await call("GET", query, 2)).json().items).toEqual([]);

			expect(
				(await call("DELETE", `/friendships/${friendship.id}`, 0))
					.statusCode,
			).toBe(204);

			expect((await call("GET", query, 1)).json().items).toEqual([]);

			expect(
				await prisma.calendarShare.count({
					where: { calendarId: calendar.id },
				}),
			).toBe(0);

			expect(
				(await call("DELETE", `/calendars/${calendar.id}`, 0))
					.statusCode,
			).toBe(204);

			expect(
				await prisma.event.count({
					where: { calendarId: calendar.id },
				}),
			).toBe(0);
		});

		it("changes passwords and deletes accounts with the required password confirmation", async () => {
			// This scenario tests password confirmation, not last-administrator protection.
			// Ensure deletion is valid even when this suite registered the first account.
			await prisma.user.update({
				where: { id: accounts[1].id },
				data: { isAdmin: true, accountRole: "admin" },
			});
			const changed = await call("PUT", "/me/password", 0, {
				currentPassword: password,
				newPassword: "replacement-password",
			});

			expect(changed.statusCode, changed.body).toBe(200);
			expect((await call("GET", "/me")).statusCode).toBe(401);

			expect(
				(
					await call("POST", "/auth/sessions", -1, {
						email: accounts[0].email,
						password,
					})
				).statusCode,
			).toBe(401);

			accounts[0].token = (
				await call("POST", "/auth/sessions", -1, {
					email: accounts[0].email,
					password: "replacement-password",
				})
			).json().token;

			expect(
				(await call("DELETE", "/me", 0, { password: "wrong-password" }))
					.statusCode,
			).toBe(403);

			expect(
				(
					await call("DELETE", "/me", 0, {
						password: "replacement-password",
					})
				).statusCode,
			).toBe(204);

			expect(
				await prisma.user.findUnique({ where: { id: accounts[0].id } }),
			).toBeNull();
		});
	},
);
