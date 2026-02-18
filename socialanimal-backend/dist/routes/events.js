"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../auth");
const db_1 = require("../db");
const eventsRoutes = async (fastify) => {
    fastify.addHook("preHandler", auth_1.authenticateToken);
    fastify.get("/", async (request, reply) => {
        try {
            const { start, end, calendarId } = request.query;
            const whereClause = {
                calendar: { userId: request.user.id },
            };
            if (calendarId) {
                whereClause.calendarId = calendarId;
            }
            if (start || end) {
                whereClause.startTime = {};
                if (start)
                    whereClause.startTime.gte = new Date(start);
                if (end)
                    whereClause.startTime.lte = new Date(end);
            }
            const events = await db_1.prisma.event.findMany({
                where: whereClause,
                include: {
                    calendar: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                        },
                    },
                },
                orderBy: {
                    startTime: "asc",
                },
            });
            return events;
        }
        catch (error) {
            return reply.status(500).send({ error: "Failed to fetch events" });
        }
    });
};
exports.default = eventsRoutes;
