import { FastifyPluginAsync } from "fastify";
import { authenticateToken } from "../utils/auth";
import { prisma } from "../utils/db";

const eventsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook("preHandler", authenticateToken);

    fastify.get("/", async (request, reply) => {
        try {
            const { start, end, calendarId } = request.query as any;
            const uid = (request as any).user.id;

            const where: any = { calendar: { userId: uid } };
            if (calendarId) where.calendarId = calendarId;
            if (start || end) {
                where.startTime = {};
                if (start) where.startTime.gte = new Date(start);
                if (end) where.startTime.lte = new Date(end);
            }

            const events = await prisma.event.findMany({
                where,
                include: {
                    calendar: { select: { id: true, name: true, type: true } },
                },
                orderBy: { startTime: "asc" },
            });

            return events;
        } catch (err) {
            return reply.status(500).send({ error: "Failed to fetch events" });
        }
    });

    fastify.get("/friends", async (request, reply) => {
        try {
            const uid = (request as any).user.id;

            const shares = await prisma.calendarShare.findMany({
                where: { sharedWithId: uid },
                include: {
                    calendar: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            userId: true,
                        },
                    },
                },
            });

            if (shares.length === 0) return reply.send([]);

            const ownerIds = [...new Set(shares.map((s) => s.calendar.userId))];
            const friendships = await prisma.friendship.findMany({
                where: {
                    status: "accepted",
                    OR: [
                        { user1Id: uid, user2Id: { in: ownerIds } },
                        { user1Id: { in: ownerIds }, user2Id: uid },
                    ],
                },
                include: {
                    user1: { select: { id: true, name: true, email: true } },
                    user2: { select: { id: true, name: true, email: true } },
                },
            });

            const activeFriendIds = new Set(
                friendships.map((f) =>
                    f.user1Id === uid ? f.user2Id : f.user1Id,
                ),
            );

            const validCalendarIds = shares
                .filter((s) => activeFriendIds.has(s.calendar.userId))
                .map((s) => s.calendarId);

            if (validCalendarIds.length === 0) return reply.send([]);

            const events = await prisma.event.findMany({
                where: { calendarId: { in: validCalendarIds } },
                include: {
                    calendar: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                            userId: true,
                        },
                    },
                },
                orderBy: { startTime: "asc" },
            });

            const userMap = new Map(
                friendships.flatMap((f) => [
                    [f.user1Id, f.user1],
                    [f.user2Id, f.user2],
                ]),
            );

            return reply.send(
                events.map((e) => ({
                    ...e,
                    owner: userMap.get((e.calendar as any).userId) ?? null,
                    isFriend: true,
                })),
            );
        } catch (err) {
            fastify.log.error(err);
            return reply
                .status(500)
                .send({ error: "Failed to fetch friend events" });
        }
    });
};

export default eventsRoutes;
