import { FastifyPluginAsync } from "fastify";
import { authenticateToken } from "../utils/auth";
import { prisma } from "../utils/db";

const friendsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook("preHandler", authenticateToken);

    fastify.get("/", async (request) => {
        const uid = (request as any).user.id;

        const friendships = await prisma.friendship.findMany({
            where: {
                OR: [{ user1Id: uid }, { user2Id: uid }],
            },
            include: {
                user1: { select: { id: true, email: true, name: true } },
                user2: { select: { id: true, email: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        const enriched = await Promise.all(
            friendships.map(async (f) => {
                const friendId = f.user1Id === uid ? f.user2Id : f.user1Id;

                const [myShares, theirShares] = await Promise.all([
                    prisma.calendarShare.findMany({
                        where: {
                            sharedWithId: friendId,
                            calendar: { userId: uid },
                        },
                        select: { calendarId: true },
                    }),
                    prisma.calendarShare.findMany({
                        where: {
                            sharedWithId: uid,
                            calendar: { userId: friendId },
                        },
                        select: {
                            calendarId: true,
                            calendar: { select: { name: true } },
                        },
                    }),
                ]);

                return {
                    ...f,
                    sharedCalendarIds: myShares.map((s) => s.calendarId),
                    sharedWithMe: theirShares.map((s) => ({
                        id: s.calendarId,
                        name: s.calendar.name,
                    })),
                };
            }),
        );

        return enriched;
    });

    fastify.post("/request", async (request, reply) => {
        try {
            const { email } = request.body as any;
            const uid = (request as any).user.id;

            if (!email)
                return reply.status(400).send({ error: "Email required" });

            const target = await prisma.user.findUnique({
                where: { email },
                select: { id: true },
            });
            if (!target)
                return reply.status(404).send({ error: "User not found" });
            if (target.id === uid)
                return reply
                    .status(400)
                    .send({ error: "Cannot friend yourself" });

            const existing = await prisma.friendship.findFirst({
                where: {
                    OR: [
                        { user1Id: uid, user2Id: target.id },
                        { user1Id: target.id, user2Id: uid },
                    ],
                },
            });
            if (existing)
                return reply
                    .status(400)
                    .send({ error: "Friendship already exists" });

            const friendship = await prisma.friendship.create({
                data: { user1Id: uid, user2Id: target.id, status: "pending" },
                include: {
                    user2: { select: { id: true, email: true, name: true } },
                },
            });

            return reply.status(201).send(friendship);
        } catch (err) {
            return reply
                .status(500)
                .send({ error: "Failed to send friend request" });
        }
    });

    fastify.post("/:id/accept", async (request, reply) => {
        try {
            const { id } = request.params as any;
            const uid = (request as any).user.id;

            const f = await prisma.friendship.findFirst({
                where: { id, user2Id: uid, status: "pending" },
            });
            if (!f)
                return reply
                    .status(404)
                    .send({ error: "Friend request not found" });

            return prisma.friendship.update({
                where: { id },
                data: { status: "accepted" },
            });
        } catch (err) {
            return reply.status(500).send({ error: "Failed to accept" });
        }
    });

    fastify.delete("/:id", async (request, reply) => {
        try {
            const { id } = request.params as any;
            const uid = (request as any).user.id;

            const f = await prisma.friendship.findFirst({
                where: { id, OR: [{ user1Id: uid }, { user2Id: uid }] },
            });
            if (!f)
                return reply
                    .status(404)
                    .send({ error: "Friendship not found" });

            const friendId = f.user1Id === uid ? f.user2Id : f.user1Id;

            await prisma.calendarShare.deleteMany({
                where: {
                    OR: [
                        { calendar: { userId: uid }, sharedWithId: friendId },
                        { calendar: { userId: friendId }, sharedWithId: uid },
                    ],
                },
            });

            await prisma.friendship.delete({ where: { id } });
            return reply.status(204).send();
        } catch (err) {
            return reply.status(500).send({ error: "Failed to remove friend" });
        }
    });

    fastify.post("/share-calendar", async (request, reply) => {
        try {
            const { friendId, calendarId, share } = request.body as any;
            const uid = (request as any).user.id;

            const friendship = await prisma.friendship.findFirst({
                where: {
                    status: "accepted",
                    OR: [
                        { user1Id: uid, user2Id: friendId },
                        { user1Id: friendId, user2Id: uid },
                    ],
                },
            });
            if (!friendship)
                return reply.status(403).send({ error: "Not friends" });

            const calendar = await prisma.calendar.findFirst({
                where: { id: calendarId, userId: uid },
            });
            if (!calendar)
                return reply.status(404).send({ error: "Calendar not found" });

            if (share) {
                await prisma.calendarShare.upsert({
                    where: {
                        calendarId_sharedWithId: {
                            calendarId,
                            sharedWithId: friendId,
                        },
                    },
                    update: {},
                    create: { calendarId, sharedWithId: friendId },
                });
            } else {
                await prisma.calendarShare.deleteMany({
                    where: { calendarId, sharedWithId: friendId },
                });
            }

            return reply.status(200).send({ ok: true });
        } catch (err) {
            fastify.log.error(err);
            return reply.status(500).send({ error: "Failed to update share" });
        }
    });
};

export default friendsRoutes;
