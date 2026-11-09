import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../../src/app";
import { prisma } from "../../../src/core/database";
import { encrypt } from "../../../src/core/secrets";
import { generateToken } from "../../../src/modules/identity";

vi.mock("../../../src/core/mail", () => ({
	mailConfigured: () => true,
	sendVerificationEmail: async () => {},
}));

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("Administration and account controls", () => {
	let app: Awaited<ReturnType<typeof buildApp>>;

	const admin = randomUUID(),
		moderator = randomUUID(),
		normal = randomUUID(),
		demo = randomUUID();

	const ids = [admin, moderator, normal, demo];

	const request = (
		method: "GET" | "POST" | "PATCH" | "PUT",
		path: string,
		payload?: object,
		id = admin,
	) =>
		prisma.user.findUniqueOrThrow({ where: { id } }).then((user) =>
			app.inject({
				method,
				url: `/api/v1${path}`,
				headers: {
					authorization: `Bearer ${generateToken(id, user.authVersion)}`,
				},
				...(payload ? { payload } : {}),
			}),
		);

	beforeAll(async () => {
		if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
			throw new Error("Disposable database required");

		app = await buildApp();

		await prisma.user.createMany({
			data: ids.map((id, i) => ({
				id,
				email: `${id}@example.test`,
				passwordHash: "private-hash",
				isAdmin: i === 0,
				accountRole: ["admin", "moderator", "normal", "readonly"][i],
			})),
		});

		await prisma.appSettings.upsert({
			where: { id: "global" },
			create: { id: "global" },
			update: {
				inviteOnly: false,
				registrationsOpen: true,
				requireEmailVerification: false,
			},
		});
	});

	afterAll(async () => {
		await prisma.appSettings.update({
			where: { id: "global" },
			data: {
				requireEmailVerification: false,
				maxCalendarsPerUser: 25,
				minSyncIntervalMinutes: 15,
			},
		});

		await prisma.calendar.deleteMany({ where: { userId: { in: ids } } });
		await prisma.user.deleteMany({ where: { id: { in: ids } } });
		await app.close();
		await prisma.$disconnect();
	});

	it("allows moderators to inspect activity but only admins to manage accounts/settings", async () => {
		for (const path of [
			"/admin/stats",
			"/admin/users",
			"/admin/sync-runs",
		]) {
			expect(
				(await request("GET", path, undefined, normal)).statusCode,
			).toBe(403);

			const response = await request("GET", path, undefined, moderator);
			expect(response.statusCode, response.body).toBe(200);
			expect(response.body).not.toContain("private-hash");
			expect(response.body).not.toContain("credentials");
		}

		expect(
			(
				await request(
					"PATCH",
					"/admin/settings",
					{ inviteOnly: true },
					moderator,
				)
			).statusCode,
		).toBe(403);

		expect(
			(
				await request(
					"PATCH",
					`/admin/users/${normal}`,
					{ accountRole: "admin" },
					moderator,
				)
			).statusCode,
		).toBe(403);

		expect(
			(await request("PATCH", "/me", { isAdmin: true }, normal))
				.statusCode,
		).toBe(400);
	});

	it("blocks read-only writes while allowing reads, and disabled sessions stop immediately", async () => {
		expect((await request("GET", "/me", undefined, demo)).statusCode).toBe(
			200,
		);

		for (const [path, payload] of [
			["/rulesets", { name: "No", fallback: "full", rules: [] }],
			["/invitations", {}],
			["/connections/google/authorizations", {}],
		] as const)
			expect(
				(await request("POST", path, payload, demo)).statusCode,
			).toBe(403);

		expect(
			(await request("PATCH", "/me", { name: "Change" }, demo))
				.statusCode,
		).toBe(403);

		expect(
			(
				await request("PATCH", `/admin/users/${normal}`, {
					disabled: true,
				})
			).statusCode,
		).toBe(200);

		expect(
			(await request("GET", "/me", undefined, normal)).statusCode,
		).toBe(401);

		await request("PATCH", `/admin/users/${normal}`, { disabled: false });
	});

	it("requires verification for calendar access but leaves profile and admin accessible", async () => {
		expect(
			(
				await request("PATCH", "/admin/settings", {
					requireEmailVerification: true,
				})
			).statusCode,
		).toBe(200);

		expect(
			(await request("GET", "/calendars", undefined, normal)).json().code,
		).toBe("EMAIL_VERIFICATION_REQUIRED");

		expect(
			(await request("GET", "/me", undefined, normal)).statusCode,
		).toBe(200);

		expect((await request("GET", "/admin/users")).statusCode).toBe(200);

		expect(
			(
				await request("PATCH", `/admin/users/${normal}`, {
					emailVerified: true,
				})
			).statusCode,
		).toBe(200);

		expect(
			(await request("GET", "/calendars", undefined, normal)).statusCode,
		).toBe(200);

		await request("PATCH", "/admin/settings", {
			requireEmailVerification: false,
		});
	});

	it("enforces calendar quotas under concurrent imports and sync minima", async () => {
		await request("PATCH", "/admin/settings", {
			maxCalendarsPerUser: 1,
			minSyncIntervalMinutes: 30,
		});

		const connection = await prisma.connection.create({
			data: {
				userId: normal,
				name: "Feed",
				type: "ics",
				credentials: encrypt({ url: "https://example.test/feed" }),
			},
		});

		const body = {
			connectionId: connection.id,
			remoteId: "1",
			name: "One",
			syncInterval: 0,
		};

		const results = await Promise.all([
			request("POST", "/calendar-imports", body, normal),
			request(
				"POST",
				"/calendar-imports",
				{ ...body, remoteId: "2" },
				normal,
			),
		]);

		expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);

		const calendar = await prisma.calendar.findFirstOrThrow({
			where: { userId: normal },
		});

		expect(
			(
				await request(
					"POST",
					"/calendar-imports",
					{ ...body, remoteId: calendar.remoteId },
					normal,
				)
			).json().id,
		).toBe(calendar.id);

		expect(
			(
				await request(
					"PATCH",
					`/calendars/${calendar.id}`,
					{ syncInterval: 1 },
					normal,
				)
			).statusCode,
		).toBe(400);

		expect(
			(
				await request(
					"PATCH",
					`/calendars/${calendar.id}`,
					{ syncInterval: 0 },
					normal,
				)
			).statusCode,
		).toBe(200);

		expect(
			(
				await request(
					"PATCH",
					`/calendars/${calendar.id}`,
					{ syncInterval: 30 },
					normal,
				)
			).statusCode,
		).toBe(200);
	});

	it("seeds defaults atomically on registration", async () => {
		const response = await app.inject({
			method: "POST",
			url: "/api/v1/auth/registrations",
			payload: {
				email: `${randomUUID()}@example.test`,
				password: "test-password",
			},
		});

		expect(response.statusCode, response.body).toBe(201);
		const id = response.json().id;
		ids.push(id);

		expect(
			await prisma.permissionRuleset.count({ where: { userId: id } }),
		).toBe(4);

		expect(response.body).not.toContain("passwordHash");
	});

	it("protects the last active admin", async () => {
		// Isolate the last-admin invariant without altering other suites' fixtures.
		const others = await prisma.user.findMany({
			where: { isAdmin: true, disabled: false, id: { not: admin } },
			select: { id: true },
		});

		await prisma.user.updateMany({
			where: { id: { in: others.map((u) => u.id) } },
			data: { disabled: true },
		});

		try {
			expect(
				(
					await request("PATCH", `/admin/users/${admin}`, {
						accountRole: "normal",
					})
				).json().code,
			).toBe("LAST_ADMIN");

			expect(
				(
					await request("PATCH", `/admin/users/${admin}`, {
						disabled: true,
					})
				).json().code,
			).toBe("LAST_ADMIN");
		} finally {
			await prisma.user.updateMany({
				where: { id: { in: others.map((u) => u.id) } },
				data: { disabled: false },
			});
		}
	});
});
