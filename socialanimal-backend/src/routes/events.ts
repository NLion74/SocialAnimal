import { FastifyPluginAsync } from "fastify";
import { authenticateToken } from "../utils/auth";
import { prisma } from "../utils/db";
import { applyPermission } from "../utils/permission";

const eventsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook("preHandler", authenticateToken);

    fastify.get("/", async (request, reply) => {
        try {
            const uid = (request as any).user.id;
            const { start, end, calendarId } = request.query as any;
            const where: any = { calendar: { userId: uid } };
            if (calendarId) where.calendarId = calendarId;
            if (start || end) {
                where.startTime = {};
                if (start) where.startTime.gte = new Date(start);
                if (end) where.startTime.lte = new Date(end);
            }
            return prisma.event.findMany({
                where,
                include: {
                    calendar: { select: { id: true, name: true, type: true } },
                },
                orderBy: { startTime: "asc" },
            });
        } catch {
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
                        include: {
                            user: {
                                select: { id: true, name: true, email: true },
                            },
                            events: {
                                include: {
                                    calendar: {
                                        select: {
                                            id: true,
                                            name: true,
                                            type: true,
                                        },
                                    },
                                },
                                orderBy: { startTime: "asc" },
                            },
                        },
                    },
                },
            });

            const events: any[] = [];
            for (const share of shares) {
                const permission = share.permission as any;
                for (const event of share.calendar.events) {
                    events.push(
                        applyPermission(
                            {
                                ...event,
                                isFriend: true,
                                owner: share.calendar.user,
                            },
                            permission,
                        ),
                    );
                }
            }

            events.sort(
                (a, b) =>
                    new Date(a.startTime).getTime() -
                    new Date(b.startTime).getTime(),
            );
            return events;
        } catch (err) {
            fastify.log.error(err);
            return reply
                .status(500)
                .send({ error: "Failed to fetch friend events" });
        }
    });
};

export default eventsRoutes;
