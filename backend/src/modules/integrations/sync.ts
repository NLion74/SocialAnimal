import { randomUUID } from "node:crypto";
import { prisma } from "../../core/database";
import { decrypt, encrypt } from "../../core/secrets";
import { fail } from "../../core/http";
import { provider, capability } from "./operations";
import type { FetchResult } from "./adapters";

export const minimumInterval = () =>
	Math.max(1, Number(process.env.MIN_SYNC_INTERVAL_MINUTES) || 15);

export async function submitSync(calendarId: string) {
	const calendar = await prisma.calendar.findUniqueOrThrow({
		where: { id: calendarId },
		select: { type: true },
	});

	capability(provider(calendar.type), "fetch");

	return prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${calendarId}))`;

		const existing = await tx.syncRun.findFirst({
			where: { calendarId, status: { in: ["queued", "running"] } },
		});

		return existing || tx.syncRun.create({ data: { calendarId } });
	});
}

export async function commitSnapshot(
	calendarId: string,
	runId: string,
	leaseOwner: string,
	result: FetchResult,
) {
	await prisma.$transaction(
		async (tx) => {
			const locked = await tx.calendar.updateMany({
				where: {
					id: calendarId,
					leaseOwner,
					leaseUntil: { gt: new Date() },
				},
				data: {
					lastSuccess: new Date(),
					lastSync: new Date(),
					lastError: null,
					leaseOwner: null,
					leaseUntil: null,
				},
			});

			if (!locked.count) fail(409, "LEASE_EXPIRED", "Sync lease expired");

			for (const event of result.events) {
				if (
					!event.externalId ||
					!Number.isFinite(event.startTime.getTime()) ||
					!Number.isFinite(event.endTime.getTime())
				)
					throw new Error("Invalid provider snapshot");

				await tx.event.upsert({
					where: {
						calendarId_externalId: {
							calendarId,
							externalId: event.externalId,
						},
					},
					create: { calendarId, ...event },
					update: event,
				});
			}

			if (result.kind === "snapshot" && result.complete)
				await tx.event.deleteMany({
					where: {
						calendarId,
						...(result.events.length
							? {
									externalId: {
										notIn: result.events.map(
											(e) => e.externalId,
										),
									},
								}
							: {}),
					},
				});

			if (result.kind === "delta" && result.deletedIds.length)
				await tx.event.deleteMany({
					where: {
						calendarId,
						externalId: { in: result.deletedIds },
					},
				});

			await tx.syncRun.update({
				where: { id: runId },
				data: {
					status: "succeeded",
					finishedAt: new Date(),
					eventsSynced: result.events.length,
				},
			});
		},
		{ timeout: 60000 },
	);
}

export async function executeSync(runId: string) {
	const owner = randomUUID();
	const now = new Date();
	const leaseMs = 120000;

	const run = await prisma.$transaction(async (tx) => {
		const job = await tx.syncRun.findUnique({ where: { id: runId } });
		if (!job || job.status !== "queued") return null;

		const claimed = await tx.syncRun.updateMany({
			where: { id: runId, status: "queued" },
			data: { status: "running", startedAt: now },
		});

		if (!claimed.count) return null;

		const lease = await tx.calendar.updateMany({
			where: {
				id: job.calendarId,
				OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
			},
			data: {
				leaseOwner: owner,
				leaseUntil: new Date(now.getTime() + leaseMs),
				lastAttempt: now,
			},
		});

		if (!lease.count) throw new Error("Calendar already leased");
		return job;
	});

	if (!run) return;

	const heartbeat = setInterval(() => {
		void prisma.calendar
			.updateMany({
				where: { id: run.calendarId, leaseOwner: owner },
				data: { leaseUntil: new Date(Date.now() + leaseMs) },
			})
			.catch(() => {});
	}, 30000);

	try {
		const calendar = await prisma.calendar.findUniqueOrThrow({
			where: { id: run.calendarId },
			include: {
				connection: true,
				user: { select: { settings: { select: { timezone: true } } } },
			},
		});

		if (!calendar.connection || !calendar.remoteId)
			throw new Error("Calendar connection is missing");

		const credentials = decrypt(calendar.connection.credentials);

		const result = await capability(provider(calendar.type), "fetch")(
			credentials,
			calendar.remoteId,
			calendar.user.settings?.timezone,
		);

		if (
			JSON.stringify(credentials) !==
			JSON.stringify(decrypt(calendar.connection.credentials))
		)
			await prisma.connection.updateMany({
				where: {
					id: calendar.connection.id,
					credentials: calendar.connection.credentials,
				},
				data: { credentials: encrypt(credentials) },
			});

		await commitSnapshot(calendar.id, run.id, owner, result);
	} catch {
		await prisma.$transaction(async (tx) => {
			const held = await tx.calendar.updateMany({
				where: { id: run.calendarId, leaseOwner: owner },
				data: {
					leaseOwner: null,
					leaseUntil: null,
					lastError:
						"Provider synchronization failed. Check the connection.",
				},
			});

			if (held.count)
				await tx.syncRun.updateMany({
					where: { id: runId, status: "running" },
					data: {
						status: "failed",
						finishedAt: new Date(),
						error: "Provider synchronization failed. Check the connection.",
					},
				});
		});
	} finally {
		clearInterval(heartbeat);
	}
}

export async function recoverLeases() {
	await prisma.$transaction(async (tx) => {
		const expired = await tx.calendar.findMany({
			where: { leaseUntil: { lt: new Date() } },
			select: { id: true, leaseOwner: true },
		});

		for (const calendar of expired) {
			const recovered = await tx.calendar.updateMany({
				where: {
					id: calendar.id,
					leaseOwner: calendar.leaseOwner,
					leaseUntil: { lt: new Date() },
				},
				data: { leaseUntil: null, leaseOwner: null },
			});

			if (recovered.count)
				await tx.syncRun.updateMany({
					where: { calendarId: calendar.id, status: "running" },
					data: { status: "queued", startedAt: null },
				});
		}
	});
}

export async function runSyncTick() {
	await recoverLeases();

	const due = await prisma.$queryRaw<
		Array<{ id: string }>
	>`SELECT "id" FROM "Calendar" WHERE "syncInterval" > 0 AND "connectionId" IS NOT NULL AND ("lastAttempt" IS NULL OR "lastAttempt" <= NOW() - (GREATEST("syncInterval", ${minimumInterval()}) * INTERVAL '1 minute')) ORDER BY "lastAttempt" ASC NULLS FIRST LIMIT 100`;

	for (const calendar of due) await submitSync(calendar.id);

	const concurrency = Math.max(
		1,
		Math.min(16, Number(process.env.SYNC_CONCURRENCY) || 3),
	);

	const jobs = await prisma.syncRun.findMany({
		where: { status: "queued" },
		take: concurrency,
		orderBy: { createdAt: "asc" },
	});

	await Promise.allSettled(jobs.map((job) => executeSync(job.id)));
}
