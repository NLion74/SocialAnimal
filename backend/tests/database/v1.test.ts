import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../src/app";
import { prisma } from "../../src/core/database";
import { decrypt, encrypt } from "../../src/core/secrets";
import { generateToken } from "../../src/modules/identity";
import {
	backfillConnections,
	validateConnections,
} from "../../src/modules/integrations";
import { registry } from "../../src/modules/integrations/adapters";
import {
	executeSync,
	submitSync,
	recoverLeases,
	runSyncTick,
	commitSnapshot,
} from "../../src/modules/integrations/sync";
import { env } from "../../src/core/config";

const enabled = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!enabled)("REST v1 with PostgreSQL", () => {
	let app: Awaited<ReturnType<typeof buildApp>>;
	const suffix = randomUUID();

	const owner = `owner-${suffix}`,
		friend = `friend-${suffix}`;

	const auth = (id = owner) => ({
		authorization: `Bearer ${generateToken(id)}`,
	});

	let connectionId: string, calendarId: string, friendshipId: string;

	beforeAll(async () => {
		if (!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith("_test"))
			throw new Error("Disposable test database required");

		app = await buildApp();

		await prisma.user.createMany({
			data: [
				{
					id: owner,
					email: `${owner}@example.test`,
					passwordHash: "hash",
					isAdmin: true,
				},
				{
					id: friend,
					email: `${friend}@example.test`,
					passwordHash: "hash",
				},
			],
		});
	});

	afterAll(async () => {
		await app?.close();
		await prisma.$disconnect();
		vi.restoreAllMocks();
	});

	it("fails backfill before writes without key; resumes batches and verifies decryptability", async () => {
		const legacyId = `legacy-stage-${suffix}`;

		await prisma.calendar.create({
			data: {
				id: legacyId,
				userId: owner,
				type: "ics",
				name: "Backfill restart",
				syncInterval: 0,
				config: { url: "https://example.test/legacy" },
			},
		});

		const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
		delete process.env.CREDENTIAL_ENCRYPTION_KEY;

		await expect(backfillConnections(1)).rejects.toThrow(
			"CREDENTIAL_ENCRYPTION_KEY",
		);

		expect(
			(
				await prisma.calendar.findUniqueOrThrow({
					where: { id: legacyId },
				})
			).connectionId,
		).toBeNull();

		process.env.CREDENTIAL_ENCRYPTION_KEY = key;
		expect(await backfillConnections(1)).toBeGreaterThan(0);
		expect(await backfillConnections(1)).toBe(0);

		const cal = await prisma.calendar.findUniqueOrThrow({
			where: { id: "baseline-calendar" },
			include: { connection: true },
		});

		expect(decrypt(cal.connection!.credentials).password).toBe(
			"secret-preserved",
		);

		expect(cal.config).toEqual({
			url: "https://example.test/private.ics",
			password: "secret-preserved",
		});

		expect(
			(
				await prisma.userSettings.findUniqueOrThrow({
					where: { userId: "baseline-owner" },
				})
			).defaultSharePermission,
		).toBe("busy");

		process.env.CREDENTIAL_ENCRYPTION_KEY = "cd".repeat(32);
		await expect(validateConnections()).rejects.toThrow();
		process.env.CREDENTIAL_ENCRYPTION_KEY = key;
		await validateConnections();
	});

	it("resumes after a later backfill batch fails without rewriting completed batches", async () => {
		const firstId = `retry-a-${suffix}`,
			secondId = `retry-z-${suffix}`;

		for (const id of [firstId, secondId])
			await prisma.calendar.create({
				data: {
					id,
					userId: owner,
					name: "Restart test",
					type: "ics",
					syncInterval: 0,
					config: { url: "https://example.test/restart" },
				},
			});

		const conflict = await prisma.connection.create({
			data: {
				id: `legacy-${secondId}`,
				userId: friend,
				name: "Conflicting record",
				type: "ics",
				credentials: encrypt({ url: "https://example.test/restart" }),
			},
		});

		await expect(backfillConnections(1)).rejects.toThrow("does not match");

		const first = await prisma.calendar.findUniqueOrThrow({
			where: { id: firstId },
			include: { connection: true },
		});

		expect(first.connectionId).toBe(`legacy-${firstId}`);

		expect(
			(
				await prisma.calendar.findUniqueOrThrow({
					where: { id: secondId },
				})
			).connectionId,
		).toBeNull();

		await prisma.connection.update({
			where: { id: conflict.id },
			data: { userId: owner },
		});

		expect(await backfillConnections(1)).toBe(1);

		expect(
			(
				await prisma.connection.findUniqueOrThrow({
					where: { id: first.connectionId! },
				})
			).credentials,
		).toBe(first.connection!.credentials);

		await validateConnections();
	});

	it("retires known roots and JWT feeds, while unknown routes stay 404", async () => {
		for (const path of [
			"/api/users/me",
			"/api/calendars",
			"/api/events",
			"/api/friends/request",
			`/api/providers/ics/export/baseline-calendar?token=${generateToken(owner)}`,
		]) {
			const r = await app.inject(path);
			expect(r.statusCode).toBe(410);
			expect(r.json().code).toBe("API_VERSION_RETIRED");
			expect(r.json().requestId).toBeTruthy();
		}

		expect((await app.inject("/api/nonsense")).statusCode).toBe(404);
		expect((await app.inject("/api/v1/nonsense")).statusCode).toBe(404);
		expect((await app.inject("/ready")).statusCode).toBe(200);
	});

	it("enforces authentication, rejects token queries, and distinguishes forbidden access", async () => {
		expect(
			(await app.inject(`/api/v1/me?token=${generateToken(owner)}`))
				.statusCode,
		).toBe(401);

		expect(
			(
				await app.inject({
					url: "/api/v1/admin/settings",
					headers: auth(friend),
				})
			).statusCode,
		).toBe(403);

		expect(
			(await app.inject({ url: "/api/v1/me", headers: auth(friend) }))
				.statusCode,
		).toBe(200);
	});

	it("creates write-only encrypted connections, preserving omitted credentials", async () => {
		const r = await app.inject({
			method: "POST",
			url: "/api/v1/connections",
			headers: auth(),
			payload: {
				type: "ics",
				name: "Test feed",
				credentials: {
					url: "https://example.test/feed",
					password: "provider-secret",
				},
			},
		});

		expect(r.statusCode, r.body).toBe(201);
		connectionId = r.json().id;
		expect(r.body).not.toContain("provider-secret");
		expect(r.json()).not.toHaveProperty("credentials");

		const updated = await app.inject({
			method: "PATCH",
			url: `/api/v1/connections/${connectionId}`,
			headers: auth(),
			payload: { name: "Renamed" },
		});

		expect(updated.statusCode).toBe(200);

		const row = await prisma.connection.findUniqueOrThrow({
			where: { id: connectionId },
		});

		expect(row.credentials).not.toContain("provider-secret");
		expect(decrypt(row.credentials).password).toBe("provider-secret");

		expect(
			(await app.inject({ url: "/api/v1/connections", headers: auth() }))
				.body,
		).not.toContain("provider-secret");
	});

	it("reports independent provider capabilities and rejects missing operations explicitly", async () => {
		const response = await app.inject({
			url: "/api/v1/providers",
			headers: auth(),
		});

		expect(
			response.json().items.find((p: any) => p.id === "icloud"),
		).toMatchObject({
			name: "Apple Calendar (iCloud)",
			discovery: true,
			sync: true,
			test: true,
			oauth: false,
		});

		expect(
			response.json().items.find((p: any) => p.id === "ics"),
		).toMatchObject({ discovery: false, sync: true });

		const discovery = await app.inject({
			method: "POST",
			url: `/api/v1/connections/${connectionId}/discoveries`,
			headers: auth(),
		});

		expect(discovery.statusCode).toBe(422);
		expect(discovery.json().code).toBe("CAPABILITY_UNSUPPORTED");
		const original = registry.ics;
		registry.ics = { name: "Sync only", fetch: original.fetch };

		try {
			const test = await app.inject({
				method: "POST",
				url: `/api/v1/connections/${connectionId}/tests`,
				headers: auth(),
			});

			expect(test.statusCode).toBe(422);
			expect(test.json().code).toBe("CAPABILITY_UNSUPPORTED");
		} finally {
			registry.ics = original;
		}
	});

	it("deduplicates concurrent imports by connection and remote identity", async () => {
		const requests = Array.from({ length: 4 }, () =>
			app.inject({
				method: "POST",
				url: "/api/v1/calendar-imports",
				headers: auth(),
				payload: {
					connectionId,
					remoteId: "feed",
					name: "Calendar",
					syncInterval: 0,
				},
			}),
		);

		const results = await Promise.all(requests);
		for (const r of results) expect(r.statusCode, r.body).toBe(201);
		expect(new Set(results.map((r) => r.json().id)).size).toBe(1);
		calendarId = results[0].json().id;

		expect(await prisma.calendar.count({ where: { connectionId } })).toBe(
			1,
		);
	});

	it("returns a persisted 202 sync resource and prevents overlapping execution", async () => {
		let release!: () => void;

		const fetch = vi
			.spyOn(registry.ics, "fetch")
			.mockImplementation(async () => {
				await new Promise<void>((r) => {
					release = r;
				});

				return { kind: "snapshot", complete: true, events: [] };
			});

		const r = await app.inject({
			method: "POST",
			url: `/api/v1/calendars/${calendarId}/sync-runs`,
			headers: auth(),
		});

		expect(r.statusCode).toBe(202);
		expect(r.headers.location).toBe(r.json().statusUrl);
		const job = r.json();
		const first = executeSync(job.id);

		for (let n = 0; n < 100 && !release; n++)
			await new Promise((r) => setTimeout(r, 10));

		await executeSync(job.id);
		expect(fetch).toHaveBeenCalledTimes(1);
		const duplicate = await submitSync(calendarId);
		expect(duplicate.id).toBe(job.id);
		release();
		await first;

		expect(
			(await app.inject({ url: job.statusUrl, headers: auth() })).json()
				.status,
		).toBe("succeeded");

		fetch.mockRestore();
	});

	it("uses overlap reads and current permission ceilings for feeds", async () => {
		friendshipId = (
			await prisma.friendship.create({
				data: { user1Id: owner, user2Id: friend, status: "accepted" },
			})
		).id;

		const event = await prisma.event.create({
			data: {
				calendarId,
				externalId: "private-remote",
				title: "Secret meeting",
				description: "Private notes",
				location: "Private room",
				startTime: new Date("2026-09-01"),
				endTime: new Date("2026-10-01"),
			},
		});

		let grant = await app.inject({
			method: "PUT",
			url: `/api/v1/calendars/${calendarId}/grants/${friend}`,
			headers: auth(),
			payload: { permission: "titles" },
		});

		expect(grant.statusCode, grant.body).toBe(204);

		const events = await app.inject({
			url: "/api/v1/events?start=2026-09-15T00:00:00Z&end=2026-09-16T00:00:00Z",
			headers: auth(friend),
		});

		expect(events.statusCode, events.body).toBe(200);
		expect(events.json().items.map((e: any) => e.id)).toContain(event.id);
		expect(events.body).not.toContain("Private notes");

		const created = await app.inject({
			method: "POST",
			url: `/api/v1/calendars/${calendarId}/subscriptions`,
			headers: auth(friend),
			payload: { ceiling: "full" },
		});

		expect(created.statusCode, created.body).toBe(201);
		const sub = created.json();
		expect(sub.ceiling).toBe("titles");
		const feedPath = new URL(sub.url).pathname;
		const token = feedPath.split("/").at(-1)!.slice(0, -4);
		const feed = await app.inject(feedPath);
		expect(feed.body).toContain("SUMMARY:Secret meeting");
		expect(feed.body).not.toContain("Private notes");
		expect(feed.body).not.toContain("private-remote");

		expect(
			(
				await app.inject({
					url: "/api/v1/me",
					headers: { authorization: `Bearer ${token}` },
				})
			).statusCode,
		).toBe(401);

		grant = await app.inject({
			method: "PUT",
			url: `/api/v1/calendars/${calendarId}/grants/${friend}`,
			headers: auth(),
			payload: { permission: "busy" },
		});

		expect(grant.statusCode).toBe(204);
		expect((await app.inject(feedPath)).body).toContain("SUMMARY:Busy");

		await app.inject({
			method: "DELETE",
			url: `/api/v1/subscriptions/${sub.id}`,
			headers: auth(friend),
		});

		expect((await app.inject(feedPath)).statusCode).toBe(404);

		const second = (
			await app.inject({
				method: "POST",
				url: `/api/v1/calendars/${calendarId}/subscriptions`,
				headers: auth(friend),
				payload: { ceiling: "full" },
			})
		).json();

		await app.inject({
			method: "DELETE",
			url: `/api/v1/friendships/${friendshipId}`,
			headers: auth(),
		});

		expect(
			await prisma.calendarShare.count({
				where: { calendarId, sharedWithId: friend },
			}),
		).toBe(0);

		expect(
			(await app.inject(new URL(second.url).pathname)).statusCode,
		).toBe(403);
	});

	it("validates event intervals and caps list limits", async () => {
		for (const query of [
			"",
			"?start=2020-01-01T00:00:00Z&end=2026-01-01T00:00:00Z",
			"?start=no&end=no",
		])
			expect(
				(
					await app.inject({
						url: `/api/v1/events${query}`,
						headers: auth(),
					})
				).statusCode,
			).toBe(400);

		expect(
			(
				await app.inject({
					url: "/api/v1/calendars?limit=501",
					headers: auth(),
				})
			).statusCode,
		).toBe(400);

		const list = (
			await app.inject({
				url: "/api/v1/calendars?limit=1",
				headers: auth(),
			})
		).json();

		expect(list).toHaveProperty("nextCursor");
		expect(list.items.length).toBeLessThanOrEqual(1);
	});

	it("deletes stale events only for complete snapshots, including empty snapshots", async () => {
		const fetch = vi.spyOn(registry.ics, "fetch").mockResolvedValue({
			kind: "snapshot",
			complete: false,
			events: [],
		});

		const partial = await submitSync(calendarId);
		await executeSync(partial.id);
		expect(await prisma.event.count({ where: { calendarId } })).toBe(1);

		fetch.mockResolvedValue({
			kind: "snapshot",
			complete: true,
			events: [],
		});

		const complete = await submitSync(calendarId);
		await executeSync(complete.id);
		expect(await prisma.event.count({ where: { calendarId } })).toBe(0);

		const calendar = await prisma.calendar.findUniqueOrThrow({
			where: { id: calendarId },
		});

		expect(calendar.lastAttempt).toBeTruthy();
		expect(calendar.lastSuccess).toBeTruthy();
		fetch.mockRejectedValue(new Error("password=DO_NOT_LEAK"));
		const failed = await submitSync(calendarId);
		await executeSync(failed.id);

		const after = await prisma.calendar.findUniqueOrThrow({
			where: { id: calendarId },
		});

		expect(after.lastSuccess).toEqual(calendar.lastSuccess);
		expect(after.lastError).not.toContain("DO_NOT_LEAK");
		fetch.mockRestore();
	});

	it("recovers expired leases and fences late writes", async () => {
		const run = await submitSync(calendarId);

		await prisma.syncRun.update({
			where: { id: run.id },
			data: { status: "running" },
		});

		await prisma.calendar.update({
			where: { id: calendarId },
			data: { leaseOwner: "dead-process", leaseUntil: new Date(0) },
		});

		await recoverLeases();

		expect(
			(await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } }))
				.status,
		).toBe("queued");

		await expect(
			commitSnapshot(calendarId, run.id, "dead-process", {
				kind: "snapshot",
				complete: true,
				events: [],
			}),
		).rejects.toThrow();

		const fetch = vi.spyOn(registry.ics, "fetch").mockResolvedValue({
			kind: "snapshot",
			complete: true,
			events: [],
		});

		await executeSync(run.id);
		fetch.mockRestore();
	});

	it("respects manual-only, each interval and the configured minimum", async () => {
		const ids: string[] = [];

		for (const [interval, minutes] of [
			[0, 300],
			[120, 90],
			[1, 5],
			[30, 60],
		]) {
			const row = await prisma.calendar.create({
				data: {
					userId: owner,
					name: `Interval ${interval}`,
					type: "ics",
					connectionId,
					remoteId: randomUUID(),
					syncInterval: interval,
					lastAttempt: new Date(Date.now() - minutes * 60000),
				},
			});

			ids.push(row.id);
		}

		const fetch = vi.spyOn(registry.ics, "fetch").mockResolvedValue({
			kind: "snapshot",
			complete: true,
			events: [],
		});

		await runSyncTick();

		for (const id of ids.slice(0, 3))
			expect(
				await prisma.syncRun.count({ where: { calendarId: id } }),
			).toBe(0);

		expect(
			await prisma.syncRun.count({ where: { calendarId: ids[3] } }),
		).toBe(1);

		fetch.mockRestore();
	});

	it("rolls back failed invite registrations and consumes an invite exactly once", async () => {
		await prisma.appSettings.update({
			where: { id: "global" },
			data: { inviteOnly: true },
		});

		const code = randomUUID();
		await prisma.inviteCode.create({ data: { code, createdBy: owner } });

		const duplicate = await app.inject({
			method: "POST",
			url: "/api/v1/auth/registrations",
			payload: {
				email: `${owner}@example.test`,
				password: "test-password",
				inviteCode: code,
			},
		});

		expect(duplicate.statusCode).toBe(409);

		expect(
			(await prisma.inviteCode.findUniqueOrThrow({ where: { code } }))
				.usedBy,
		).toBeNull();

		const requests = [1, 2].map((n) =>
			app.inject({
				method: "POST",
				url: "/api/v1/auth/registrations",
				payload: {
					email: `invite-${n}-${suffix}@example.test`,
					password: "test-password",
					inviteCode: code,
				},
			}),
		);

		const results = await Promise.all(requests);
		expect(results.map((r) => r.statusCode).sort()).toEqual([201, 403]);

		expect(
			await prisma.user.count({
				where: {
					email: {
						startsWith: "invite-",
						endsWith: `${suffix}@example.test`,
					},
				},
			}),
		).toBe(1);

		await prisma.appSettings.update({
			where: { id: "global" },
			data: { inviteOnly: false },
		});
	});

	it("completes Google OAuth server-side with expiring single-use user-bound state", async () => {
		Object.assign(env.google, {
			clientId: "test-client",
			clientSecret: "test-secret",
			redirectUri: "http://localhost/api/v1/connections/google/callback",
		});

		const authorization = await app.inject({
			method: "POST",
			url: "/api/v1/connections/google/authorizations",
			headers: auth(),
		});

		expect(authorization.statusCode).toBe(200);

		const state = new URL(authorization.json().url).searchParams.get(
			"state",
		)!;

		const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					access_token: "google-private-access",
					refresh_token: "google-private-refresh",
				}),
			),
		);

		const callback = await app.inject(
			`/api/v1/connections/google/callback?state=${state}&code=code`,
		);

		expect(callback.statusCode, callback.body).toBe(302);
		expect(callback.headers.location).not.toContain("google-private");

		const flow = new URL(callback.headers.location!).searchParams.get(
			"flow",
		)!;

		expect(
			(
				await app.inject({
					url: `/api/v1/connections?flow=${flow}`,
					headers: auth(),
				})
			).statusCode,
		).toBe(200);

		expect(
			(
				await app.inject({
					url: `/api/v1/connections?flow=${flow}`,
					headers: auth(friend),
				})
			).statusCode,
		).toBe(404);

		expect(
			(
				await app.inject(
					`/api/v1/connections/google/callback?state=${state}&code=code`,
				)
			).statusCode,
		).toBe(400);

		expect(fetch).toHaveBeenCalledTimes(1);
		fetch.mockRestore();
	});
});
