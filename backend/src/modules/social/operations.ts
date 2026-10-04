import { prisma } from "../../core/database";
import { pageArgs, type PageQuery } from "../../core/http";

export async function listFriendshipsWithShares(
	userId: string,
	query: PageQuery = {},
) {
	const friendships = await prisma.friendship.findMany({
		where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
		include: {
			user1: { select: { id: true, email: true, name: true } },
			user2: { select: { id: true, email: true, name: true } },
		},
		...pageArgs(query),
	});

	return Promise.all(
		friendships.map(async (f: any) => {
			const friendId = f.user1Id === userId ? f.user2Id : f.user1Id;

			const [myShares, theirShares] = await Promise.all([
				prisma.calendarShare.findMany({
					where: {
						sharedWithId: friendId,
						calendar: { userId },
					},
					select: {
						calendarId: true,
						permission: true,
						rulesetId: true,
						expiresAt: true,
					},
				}),
				prisma.calendarShare.findMany({
					where: {
						sharedWithId: userId,
						calendar: { userId: friendId },
						OR: [
							{ expiresAt: null },
							{ expiresAt: { gt: new Date() } },
						],
					},
					select: {
						calendarId: true,
						permission: true,
						ruleset: { select: { fallback: true, rules: true } },
						calendar: { select: { name: true } },
					},
				}),
			]);

			return {
				...f,
				sharedCalendarIds: myShares.map((s: any) => s.calendarId),
				sharedCalendarExpirations: Object.fromEntries(
					myShares.map((s) => [
						s.calendarId,
						s.expiresAt?.toISOString() || null,
					]),
				),
				sharedCalendarRulesets: Object.fromEntries(
					myShares
						.filter((s) => s.rulesetId)
						.map((s) => [s.calendarId, s.rulesetId]),
				),
				sharedCalendarPermissions: Object.fromEntries(
					myShares.map((s: any) => [s.calendarId, s.permission]),
				),
				sharedWithMe: theirShares.map((s: any) => ({
					id: s.calendarId,
					name: s.calendar.name,
					permission: s.permission,
					accessLabel: s.ruleset
						? Array.isArray(s.ruleset.rules) &&
							s.ruleset.rules.length
							? "Custom rules"
							: (
									{
										full: "Full details",
										titles: "Titles only",
										busy: "Busy only",
										hidden: "Hidden",
									} as Record<string, string>
								)[s.ruleset.fallback]
						: (
								{
									full: "Full details",
									titles: "Titles only",
									busy: "Busy only",
								} as Record<string, string>
							)[s.permission],
				})),
			};
		}),
	);
}

export async function requestFriend(userId: string, identifier: string) {
	const trimmed = identifier.trim();

	const target = await prisma.user.findFirst({
		where: {
			OR: [
				{ email: { equals: trimmed, mode: "insensitive" } },
				{ name: { equals: trimmed, mode: "insensitive" } },
			],
		},
		select: { id: true },
	});

	if (!target) return "not-found";

	return requestFriendByUserId(userId, target.id);
}

export async function requestFriendByUserId(
	userId: string,
	targetUserId: string,
) {
	const target = await prisma.user.findUnique({
		where: { id: targetUserId },
		select: { id: true },
	});

	if (!target) return "not-found";
	if (target.id === userId) return "self";

	return prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${[userId, target.id].sort().join(":")}))`;

		const existing = await tx.friendship.findFirst({
			where: {
				OR: [
					{ user1Id: userId, user2Id: target.id },
					{ user1Id: target.id, user2Id: userId },
				],
			},
		});

		if (existing) return "exists";

		const friendship = await tx.friendship.create({
			data: { user1Id: userId, user2Id: target.id, status: "pending" },
			include: {
				user1: { select: { id: true, email: true, name: true } },
				user2: { select: { id: true, email: true, name: true } },
			},
		});

		return friendship;
	});
}

export async function searchUsersByUsername(
	userId: string,
	query: string,
	pagination: PageQuery = {},
) {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const users = await prisma.user.findMany({
		where: {
			id: { not: userId },
			name: {
				contains: trimmed,
				mode: "insensitive",
			},
		},
		select: {
			id: true,
			name: true,
			email: true,
		},
		...pageArgs(pagination),
	});

	return users;
}

export async function acceptFriendRequest(
	userId: string,
	friendshipId: string,
) {
	const f = await prisma.friendship.findFirst({
		where: { id: friendshipId, user2Id: userId, status: "pending" },
	});

	if (!f) return null;

	return prisma.friendship.update({
		where: { id: friendshipId },
		data: { status: "accepted" },
		include: {
			user1: { select: { id: true, email: true, name: true } },
			user2: { select: { id: true, email: true, name: true } },
		},
	});
}

export async function removeFriendship(userId: string, friendshipId: string) {
	const f = await prisma.friendship.findFirst({
		where: {
			id: friendshipId,
			OR: [{ user1Id: userId }, { user2Id: userId }],
		},
	});

	if (!f) return false;
	const friendId = f.user1Id === userId ? f.user2Id : f.user1Id;

	await prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${[userId, friendId].sort().join(":")}))`;

		await tx.calendarShare.deleteMany({
			where: {
				OR: [
					{ calendar: { userId }, sharedWithId: friendId },
					{ calendar: { userId: friendId }, sharedWithId: userId },
				],
			},
		});

		await tx.friendship.deleteMany({ where: { id: friendshipId } });
	});

	return true;
}
