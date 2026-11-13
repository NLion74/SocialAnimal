import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Client } from "pg";

// The scheduler drains the entire instance queue, so use its own database.
const isolated = vi.hoisted(() => {
	const name = `scheduler_${Math.random().toString(16).slice(2)}_test`;
	const url = new URL(
		process.env.TEST_DATABASE_URL ||
			"postgresql://test:test@localhost/unit_test",
	);
	url.pathname = `/${name}`;
	return { name, url: url.href };
});
vi.mock("../../../src/core/database", async () => {
	const { PrismaClient } = await import("@prisma/client");
	const { PrismaPg } = await import("@prisma/adapter-pg");
	return {
		prisma: new PrismaClient({
			adapter: new PrismaPg({ connectionString: isolated.url }),
		}),
	};
});
import { prisma } from "../../../src/core/database";
import { encrypt } from "../../../src/core/secrets";
import { runSyncTick } from "../../../src/modules/integrations/sync";
import { registry } from "../../../src/modules/integrations/adapters";
import { registrationSettings } from "../../../src/modules/settings";

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"Database scheduling settings",
	() => {
		const userId = randomUUID();
		const admin = new Client({
			connectionString: process.env.TEST_DATABASE_URL,
		});
		let original: Awaited<ReturnType<typeof registrationSettings>>;
		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");
			await admin.connect();
			await admin.query(`CREATE DATABASE "${isolated.name}"`);
			execFileSync(
				process.execPath,
				["node_modules/prisma/build/index.js", "migrate", "deploy"],
				{
					env: { ...process.env, DATABASE_URL: isolated.url },
					stdio: "pipe",
				},
			);
			original = await registrationSettings();
			await prisma.user.create({
				data: {
					id: userId,
					email: `${userId}@example.test`,
					passwordHash: "test",
				},
			});
		});
		afterAll(async () => {
			vi.restoreAllMocks();
			vi.unstubAllEnvs();
			await prisma.calendar.deleteMany({ where: { userId } });
			await prisma.user.delete({ where: { id: userId } });
			await prisma.appSettings.update({
				where: { id: "global" },
				data: original,
			});
			await prisma.$disconnect();
			await admin.query(`DROP DATABASE "${isolated.name}" WITH (FORCE)`);
			await admin.end();
		});
		it("uses saved interval and concurrency on the next tick and leaves manual calendars unscheduled", async () => {
			vi.stubEnv("MIN_SYNC_INTERVAL_MINUTES", "9999");
			vi.stubEnv("SYNC_CONCURRENCY", "16");
			const connection = await prisma.connection.create({
				data: {
					userId,
					type: "google",
					name: "Mock Google",
					credentials: encrypt({ accessToken: "test" }),
				},
			});
			const calendars = await Promise.all(
				[0, 1, 1, 1].map((syncInterval, i) =>
					prisma.calendar.create({
						data: {
							userId,
							type: "google",
							name: `Calendar ${i}`,
							connectionId: connection.id,
							remoteId: String(i),
							syncInterval,
							lastAttempt: new Date(Date.now() - 5 * 60000),
						},
					}),
				),
			);
			vi.spyOn(registry.google, "fetch").mockImplementation(
				async (_credentials, _remote, _timezone, window) => ({
					kind: "snapshot",
					complete: true,
					events: [],
					coverage: window,
				}),
			);
			await prisma.appSettings.update({
				where: { id: "global" },
				data: { minSyncIntervalMinutes: 30, syncConcurrency: 1 },
			});
			await runSyncTick();
			const where = { calendarId: { in: calendars.map((c) => c.id) } };
			expect(await prisma.syncRun.count({ where })).toBe(0);
			await prisma.appSettings.update({
				where: { id: "global" },
				data: { minSyncIntervalMinutes: 1 },
			});
			await runSyncTick();
			expect(
				await prisma.syncRun.count({
					where: { ...where, status: "succeeded" },
				}),
			).toBe(1);
			expect(
				await prisma.syncRun.count({
					where: { ...where, status: "queued" },
				}),
			).toBe(2);
			await prisma.appSettings.update({
				where: { id: "global" },
				data: { syncConcurrency: 2 },
			});
			await runSyncTick();
			expect(
				await prisma.syncRun.count({
					where: { ...where, status: "succeeded" },
				}),
			).toBe(3);
			expect(
				await prisma.syncRun.count({
					where: { calendarId: calendars[0].id },
				}),
			).toBe(0);
		});
	},
);
