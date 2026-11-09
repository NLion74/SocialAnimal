import type { Notification } from "@prisma/client";
import { prisma, type Prisma } from "../../core/database";
import { encrypt, tokenHash } from "../../core/secrets";
import { mailConfigured, sendNotificationEmail } from "../../core/mail";
import { timegrid } from "../../services/permissions";
import { eventAccess } from "../sharing";

export const preferenceKeys = {
	friendRequest: "emailFriendRequests",
	friendAccepted: "emailFriendAccepted",
	highlight: "emailHighlights",
	syncFailure: "emailSyncFailures",
} as const;
export type NotificationKind = keyof typeof preferenceKeys;

export async function notify(
	tx: Prisma.TransactionClient,
	userId: string,
	kind: NotificationKind,
	referenceId: string,
	dedupeKey: string,
) {
	// The caller owns the transaction that also changes the underlying resource.
	await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`notification:${dedupeKey}`}))`;
	const existing = await tx.notification.findUnique({ where: { dedupeKey } });
	if (existing) return;
	const notification = await tx.notification.create({
		data: { userId, kind, referenceId, dedupeKey },
	});
	const user = await tx.user.findUnique({
		where: { id: userId },
		include: { settings: true },
	});

	if (
		user &&
		!user.disabled &&
		user.emailVerifiedAt &&
		user.settings?.[preferenceKeys[kind]] &&
		mailConfigured()
	) {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(742905)`;
		if (
			(await tx.recoveryMail.count({
				where: { status: { in: ["queued", "retrying", "running"] } },
			})) >= 1000
		)
			return;
		await tx.recoveryMail.create({
			data: {
				kind: "notification",
				userId,
				recipientHash: tokenHash(user.email),
				payload: encrypt({
					email: user.email,
					notificationId: notification.id,
				}),
				expiresAt: new Date(Date.now() + 86400000),
			},
		});
	}
}

export async function present(notification: Notification) {
	const { kind, userId, referenceId } = notification;
	let title: string;
	let href: string;
	let tab: "friends" | "calendar";
	let active = false;

	if (kind === "friendRequest" || kind === "friendAccepted") {
		const friendship = await prisma.friendship.findFirst({
			where: {
				id: referenceId,
				OR: [{ user1Id: userId }, { user2Id: userId }],
			},
			include: { user1: true, user2: true },
		});
		if (
			!friendship ||
			friendship.user1.disabled ||
			friendship.user2.disabled
		)
			return null;
		if (kind === "friendRequest" && friendship.status !== "pending")
			return null;
		if (kind === "friendAccepted" && friendship.status !== "accepted")
			return null;
		const friend =
			friendship.user1Id === userId ? friendship.user2 : friendship.user1;
		title = `${friend.name || friend.email} ${kind === "friendRequest" ? "sent you a friend request" : "accepted your friend request"}`;
		href = "/friends";
		tab = "friends";
		active = kind === "friendRequest";
	} else if (kind === "syncFailure") {
		const calendar = await prisma.calendar.findFirst({
			where: { id: referenceId, userId },
		});
		if (
			!calendar?.lastError ||
			(calendar.lastSuccess &&
				calendar.lastSuccess > notification.createdAt)
		)
			return null;
		title = `${calendar.name} needs synchronization attention`;
		href = "/dashboard";
		tab = "calendar";
		active = true;
	} else if (kind === "highlight") {
		const events = await prisma.event.findMany({
			where: {
				calendarId: referenceId,
				endTime: { gt: new Date() },
				highlights: { some: { userId } },
			},
			take: 50001,
			orderBy: { startTime: "asc" },
		});
		if (!events.length) return null;
		try {
			const mask = await eventAccess(referenceId, userId);
			const first = events.find(
				(event) => mask(event)?.visibility === "highlight",
			);
			if (!first) return null;
			title = "Shared events are highlighted for you";
			const preferences = await prisma.userSettings.findUnique({
				where: { userId },
				select: { timezone: true },
			});
			href = `/calendar?date=${timegrid(first.startTime, preferences?.timezone || "UTC")["timegrid.date"]}`;
			tab = "calendar";
		} catch (error) {
			if ((error as { statusCode?: number }).statusCode === 403)
				return null;
			throw error;
		}
	} else return null;

	return {
		id: notification.id,
		title,
		href,
		tab,
		active,
		readAt: notification.readAt,
		createdAt: notification.createdAt,
	};
}

export async function deliverNotification(
	notificationId: string,
	email: string,
): Promise<boolean> {
	const notification = await prisma.notification.findUnique({
		where: { id: notificationId },
		include: { user: { include: { settings: true } } },
	});
	if (!notification) return false;
	const { user } = notification;
	const preference = preferenceKeys[notification.kind as NotificationKind];
	if (
		!preference ||
		user.disabled ||
		!user.emailVerifiedAt ||
		user.email !== email ||
		!user.settings?.[preference]
	)
		return false;
	const current = await present(notification);
	if (!current) return false;
	await sendNotificationEmail(email, current.title, current.href);
	return true;
}
