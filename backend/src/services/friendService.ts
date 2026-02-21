import { prisma } from "../utils/db";

export async function listFriendshipsWithShares(userId: string) {
    const friendships = await prisma.friendship.findMany({
        where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
        include: {
            user1: { select: { id: true, email: true, name: true } },
            user2: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
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
                    select: { calendarId: true, permission: true },
                }),
                prisma.calendarShare.findMany({
                    where: {
                        sharedWithId: userId,
                        calendar: { userId: friendId },
                    },
                    select: {
                        calendarId: true,
                        permission: true,
                        calendar: { select: { name: true } },
                    },
                }),
            ]);
            return {
                ...f,
                sharedCalendarIds: myShares.map((s: any) => s.calendarId),
                sharedCalendarPermissions: Object.fromEntries(
                    myShares.map((s: any) => [s.calendarId, s.permission]),
                ),
                sharedWithMe: theirShares.map((s: any) => ({
                    id: s.calendarId,
                    name: s.calendar.name,
                    permission: s.permission,
                })),
            };
        }),
    );
}

export async function requestFriend(userId: string, email: string) {
    const target = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
    });
    if (!target) return "not-found";
    if (target.id === userId) return "self";

    const existing = await prisma.friendship.findFirst({
        where: {
            OR: [
                { user1Id: userId, user2Id: target.id },
                { user1Id: target.id, user2Id: userId },
            ],
        },
    });
    if (existing) return "exists";

    const friendship = await prisma.friendship.create({
        data: { user1Id: userId, user2Id: target.id, status: "pending" },
        include: {
            user2: { select: { id: true, email: true, name: true } },
        },
    });

    return friendship;
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

    await prisma.calendarShare.deleteMany({
        where: {
            OR: [
                { calendar: { userId }, sharedWithId: friendId },
                { calendar: { userId: friendId }, sharedWithId: userId },
            ],
        },
    });

    await prisma.friendship.delete({ where: { id: friendshipId } });
    return true;
}

export async function setCalendarShare(opts: {
    ownerId: string;
    friendId: string;
    calendarId: string;
    share: boolean;
    permission: string;
}) {
    const { ownerId, friendId, calendarId, share, permission } = opts;

    const friendship = await prisma.friendship.findFirst({
        where: {
            status: "accepted",
            OR: [
                { user1Id: ownerId, user2Id: friendId },
                { user1Id: friendId, user2Id: ownerId },
            ],
        },
    });
    if (!friendship) return "not-friend";

    const calendar = await prisma.calendar.findFirst({
        where: { id: calendarId, userId: ownerId },
    });
    if (!calendar) return "no-calendar";

    if (share) {
        await prisma.calendarShare.upsert({
            where: {
                calendarId_sharedWithId: {
                    calendarId,
                    sharedWithId: friendId,
                },
            },
            update: { permission },
            create: { calendarId, sharedWithId: friendId, permission },
        });
    } else {
        await prisma.calendarShare.deleteMany({
            where: { calendarId, sharedWithId: friendId },
        });
    }

    return "ok";
}
