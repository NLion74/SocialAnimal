import { notify } from "../notifications";
import { providerFailure } from "../../core/http/provider-errors";
import type { JobLogger } from "../../core/jobs";
import { registrationSettings } from "../settings";
import { randomUUID } from "node:crypto";
import { prisma } from "../../core/database";
import { decrypt, encrypt } from "../../core/secrets";
import { fail } from "../../core/http";
import { provider, capability } from "./operations";
import { type SyncWindow, maxSnapshotEvents } from "./adapters/window";
import type { FetchResult } from "./adapters";

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
	window?: SyncWindow,
) {
	if (result.events.length > maxSnapshotEvents)
		throw new Error("Snapshot too large");

	if (
		window &&
		result.kind === "snapshot" &&
		(!result.complete ||
			!result.coverage ||
			+result.coverage.start !== +window.start ||
			+result.coverage.end !== +window.end)
	)
		throw new Error("Incomplete provider coverage");

	if (
		result.events.some(
			(event) =>
				!event.externalId ||
				!Number.isFinite(+event.startTime) ||
				!Number.isFinite(+event.endTime) ||
				+event.endTime < +event.startTime,
		)
	)
		throw new Error("Invalid provider snapshot");

	if (window)
		result = {
			...result,
			events: result.events.filter(
				(event) =>
					event.startTime < window.end &&
					event.endTime > window.start,
			),
		};

	await prisma.$transaction(
		async (tx) => {
			if (window) {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(742903)`;
				const current = await registrationSettings(tx);

				if (
					current.syncPastDays !== window.pastDays ||
					current.syncFutureDays !== window.futureDays
				) {
					const released = await tx.calendar.updateMany({
						where: {
							id: calendarId,
							leaseOwner,
							leaseUntil: { gt: new Date() },
						},
						data: { leaseOwner: null, leaseUntil: null },
					});

					if (!released.count)
						fail(409, "LEASE_EXPIRED", "Sync lease expired");

					await tx.syncRun.update({
						where: { id: runId },
						data: { status: "queued", startedAt: null },
					});

					return;
				}
			}

			const locked = await tx.calendar.updateMany({
				where: {
					id: calendarId,
					leaseOwner,
					leaseUntil: { gt: new Date() },
				},
				data: {
					lastSuccess: new Date(),
					...(result.kind === "snapshot" &&
					result.complete &&
					result.coverage
						? {
								coverageStart: result.coverage.start,
								coverageEnd: result.coverage.end,
							}
						: {}),
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

export async function executeSync(runId: string, logger?: JobLogger) {
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
	const started = performance.now();

	logger?.info(
		{ job: "calendar-sync", runId, calendarId: run.calendarId },
		"Calendar synchronization started",
	);

	const heartbeat = setInterval(() => {
		void prisma.calendar
			.updateMany({
				where: { id: run.calendarId, leaseOwner: owner },
				data: { leaseUntil: new Date(Date.now() + leaseMs) },
			})
			.catch((error) =>
				logger?.warn(
					{ job: "calendar-sync", runId, err: error },
					"Calendar lease heartbeat failed",
				),
			);
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

		const settings = await registrationSettings();

		const window: SyncWindow = {
			start: new Date(+now - settings.syncPastDays * 86400000),
			end: new Date(+now + settings.syncFutureDays * 86400000),
			pastDays: settings.syncPastDays,
			futureDays: settings.syncFutureDays,
		};

		const credentials = decrypt(calendar.connection.credentials);
		logger?.debug(
			{
				job: "calendar-sync",
				runId,
				provider: calendar.type,
				pastDays: window.pastDays,
				futureDays: window.futureDays,
			},
			"Fetching provider calendar",
		);

		const result = await capability(provider(calendar.type), "fetch")(
			credentials,
			calendar.remoteId,
			calendar.user.settings?.timezone,
			window,
		);
		logger?.debug(
			{
				job: "calendar-sync",
				runId,
				kind: result.kind,
				eventCount: result.events.length,
				durationMs: Math.round(performance.now() - started),
			},
			"Provider calendar fetched; persisting snapshot",
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

		await commitSnapshot(calendar.id, run.id, owner, result, window);

		logger?.info(
			{
				job: "calendar-sync",
				runId,
				calendarId: calendar.id,
				provider: calendar.type,
				durationMs: Math.round(performance.now() - started),
			},
			"Calendar snapshot processed",
		);
	} catch (error) {
		const failure = providerFailure(error);

		logger?.warn(
			{
				job: "calendar-sync",
				runId,
				calendarId: run.calendarId,
				code: failure.code,
				err: error,
				durationMs: Math.round(performance.now() - started),
			},
			failure.message,
		);

		await prisma.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(742904)`;

			const before = await tx.calendar.findUnique({
				where: { id: run.calendarId },
			});
			const held = await tx.calendar.updateMany({
				where: { id: run.calendarId, leaseOwner: owner },
				data: {
					leaseOwner: null,
					leaseUntil: null,
					lastError: failure.message,
				},
			});

			if (held.count && before && !before.lastError)
				await notify(
					tx,
					before.userId,
					"syncFailure",
					before.id,
					`syncFailure:${run.id}`,
				);

			if (held.count)
				await tx.syncRun.updateMany({
					where: { id: runId, status: "running" },
					data: {
						status: "failed",
						finishedAt: new Date(),
						error: failure.message,
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

export async function runSyncTick(logger?: JobLogger) {
	await recoverLeases();
	const settings = await registrationSettings();

	const due = await prisma.$queryRaw<
		Array<{ id: string }>
	>`SELECT "id" FROM "Calendar" WHERE "syncInterval" > 0 AND "connectionId" IS NOT NULL AND ("lastAttempt" IS NULL OR "lastAttempt" <= NOW() - (GREATEST("syncInterval", ${settings.minSyncIntervalMinutes}) * INTERVAL '1 minute')) ORDER BY "lastAttempt" ASC NULLS FIRST LIMIT 100`;

	for (const calendar of due) await submitSync(calendar.id);

	const concurrency = settings.syncConcurrency;

	const jobs = await prisma.syncRun.findMany({
		where: { status: "queued" },
		take: concurrency,
		orderBy: { createdAt: "asc" },
	});
	logger?.debug(
		{
			job: "calendar-sync",
			dueCount: due.length,
			queuedCount: jobs.length,
			concurrency,
		},
		"Synchronization queue checked",
	);

	const results = await Promise.allSettled(
		jobs.map((job) => executeSync(job.id, logger)),
	);

	for (const [index, result] of results.entries())
		if (result.status === "rejected")
			logger?.error(
				{
					job: "calendar-sync",
					runId: jobs[index].id,
					err: result.reason,
				},
				"Calendar synchronization could not complete",
			);
}
