import { prisma } from "../../core/database";
import { tokenHash } from "../../core/secrets";
import { eventAccess } from "../sharing";
import { notify } from "./operations";

// Persist revisions on shares. A restart safely repeats scans without repeating notifications.
let cursor: string | undefined;

export async function reconcileHighlights() {
	await prisma.$executeRaw`DELETE FROM "EventHighlight" h USING "Event" e WHERE h."eventId" = e.id AND NOT EXISTS (SELECT 1 FROM "CalendarShare" s WHERE s."calendarId" = e."calendarId" AND s."sharedWithId" = h."userId" AND (s."expiresAt" IS NULL OR s."expiresAt" > NOW()))`;
	const policy = await prisma.appSettings.findUnique({
		where: { id: "global" },
		select: { requireEmailVerification: true, requireTwoFactor: true },
	});
	const day = new Date().toISOString().slice(0, 10);

	const shares = await prisma.calendarShare.findMany({
		where: { id: cursor ? { gt: cursor } : undefined },
		include: {
			calendar: {
				include: {
					user: {
						select: {
							disabled: true,
							settings: { select: { timezone: true } },
						},
					},
				},
			},
			ruleset: true,
			sharedWith: {
				select: {
					disabled: true,
					name: true,
					email: true,
					emailVerifiedAt: true,
				},
			},
		},
		orderBy: { id: "asc" },
		take: 25,
	});
	cursor = shares.length === 25 ? shares.at(-1)!.id : undefined;

	for (const share of shares) {
		const revision = tokenHash(
			JSON.stringify([
				day,
				policy,
				share.calendar.lastSuccess,
				share.ruleset?.version,
				share.rulesetId,
				share.permission,
				share.expiresAt,
				!!share.expiresAt && share.expiresAt <= new Date(),
				share.sharedWith,
				share.calendar.user,
			]),
		);
		if (revision === share.highlightRevision) continue;
		const ids: string[] = [];

		const hasHighlight =
			share.ruleset?.fallback === "highlight" ||
			(Array.isArray(share.ruleset?.rules) &&
				share.ruleset.rules.some(
					(rule) =>
						rule &&
						typeof rule === "object" &&
						!Array.isArray(rule) &&
						rule.visibility === "highlight",
				));

		try {
			const mask = await eventAccess(
				share.calendarId,
				share.sharedWithId,
			);
			const events = await prisma.event.findMany({
				where: {
					calendarId: share.calendarId,
					id: hasHighlight ? undefined : { in: [] },
					endTime: { gt: new Date() },
					startTime: { lt: new Date(Date.now() + 366 * 86400000) },
				},
				take: 50001,
			});
			// Never partially reconcile an oversized calendar.
			if (events.length > 50000) continue;
			for (const event of events)
				if (mask(event)?.visibility === "highlight") ids.push(event.id);
		} catch (error) {
			if ((error as { statusCode?: number }).statusCode !== 403)
				throw error;
		}

		await prisma.$transaction(async (tx) => {
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`highlight:${share.id}`}))`;
			const current = await tx.calendarShare.findUnique({
				where: { id: share.id },
			});
			if (!current || current.highlightRevision === revision) return;
			const old = await tx.eventHighlight.findMany({
				where: {
					userId: share.sharedWithId,
					event: { calendarId: share.calendarId },
				},
			});
			const previous = new Set(old.map((row) => row.eventId));
			await tx.eventHighlight.deleteMany({
				where: {
					userId: share.sharedWithId,
					event: { calendarId: share.calendarId },
					eventId: { notIn: ids },
				},
			});
			if (ids.length)
				await tx.eventHighlight.createMany({
					data: ids.map((eventId) => ({
						userId: share.sharedWithId,
						eventId,
					})),
					skipDuplicates: true,
				});
			if (ids.some((id) => !previous.has(id)))
				await notify(
					tx,
					share.sharedWithId,
					"highlight",
					share.calendarId,
					`highlight:${share.id}:${revision}`,
				);
			await tx.calendarShare.update({
				where: { id: share.id },
				data: { highlightRevision: revision },
			});
		});
	}

	await prisma.notification.deleteMany({
		where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } },
	});
}
