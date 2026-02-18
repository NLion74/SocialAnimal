"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../auth");
const db_1 = require("../db");
const ical_generator_1 = __importDefault(require("ical-generator"));
const icsRoutes = async (fastify) => {
    fastify.addHook("preHandler", auth_1.authenticateToken);
    fastify.get("/my-calendar.ics", async (request, reply) => {
        try {
            const events = await db_1.prisma.event.findMany({
                where: {
                    calendar: { userId: request.user.id },
                },
                include: {
                    calendar: {
                        select: {
                            name: true,
                        },
                    },
                },
                orderBy: {
                    startTime: "asc",
                },
            });
            const calendar = (0, ical_generator_1.default)({
                name: "My Calendar",
                description: "Personal calendar export",
                timezone: "UTC",
            });
            events.forEach((event) => {
                calendar.createEvent({
                    start: event.startTime,
                    end: event.endTime,
                    allDay: event.allDay,
                    summary: event.title,
                    description: event.description,
                    location: event.location,
                    stamp: event.createdAt,
                });
            });
            const icsData = calendar.toString();
            reply.header("Content-Type", "text/calendar; charset=utf-8");
            reply.header("Content-Disposition", 'attachment; filename="my-calendar.ics"');
            return reply.send(icsData);
        }
        catch (error) {
            return reply
                .status(500)
                .send({ error: "Failed to export calendar" });
        }
    });
    fastify.get("/shared/:userId.ics", async (request, reply) => {
        try {
            const { userId } = request.params;
            // Check if user is friends with the calendar owner
            const friendship = await db_1.prisma.friendship.findFirst({
                where: {
                    OR: [
                        {
                            user1Id: request.user.id,
                            user2Id: userId,
                            status: "accepted",
                        },
                        {
                            user1Id: userId,
                            user2Id: request.user.id,
                            status: "accepted",
                        },
                    ],
                },
            });
            if (!friendship) {
                return reply
                    .status(403)
                    .send({ error: "Access denied - not friends" });
            }
            const events = await db_1.prisma.event.findMany({
                where: {
                    calendar: { userId },
                },
                include: {
                    calendar: {
                        select: {
                            name: true,
                        },
                    },
                },
                orderBy: {
                    startTime: "asc",
                },
            });
            const calendar = (0, ical_generator_1.default)({
                name: "Shared Calendar",
                description: "Shared calendar export",
                timezone: "UTC",
            });
            events.forEach((event) => {
                calendar.createEvent({
                    start: event.startTime,
                    end: event.endTime,
                    allDay: event.allDay,
                    summary: event.title,
                    description: event.description,
                    location: event.location,
                    stamp: event.createdAt,
                });
            });
            const icsData = calendar.toString();
            reply.header("Content-Type", "text/calendar; charset=utf-8");
            reply.header("Content-Disposition", 'attachment; filename="shared-calendar.ics"');
            return reply.send(icsData);
        }
        catch (error) {
            return reply
                .status(500)
                .send({ error: "Failed to export shared calendar" });
        }
    });
};
exports.default = icsRoutes;
