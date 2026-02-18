"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../auth");
const db_1 = require("../db");
const calendarsRoutes = async (fastify) => {
    fastify.addHook("preHandler", auth_1.authenticateToken);
    fastify.get("/", async (request, reply) => {
        const calendars = await db_1.prisma.calendar.findMany({
            where: { userId: request.user.id },
            include: {
                events: {
                    select: {
                        id: true,
                        title: true,
                        startTime: true,
                        endTime: true,
                        allDay: true,
                    },
                },
            },
        });
        return calendars;
    });
    fastify.post("/", async (request, reply) => {
        try {
            const { name, type, config } = request.body;
            if (!name || !type) {
                return reply
                    .status(400)
                    .send({ error: "Name and type required" });
            }
            const calendar = await db_1.prisma.calendar.create({
                data: {
                    userId: request.user.id,
                    name,
                    type,
                    config: config || {},
                },
            });
            return reply.status(201).send(calendar);
        }
        catch (error) {
            return reply
                .status(500)
                .send({ error: "Failed to create calendar" });
        }
    });
    fastify.delete("/:id", async (request, reply) => {
        try {
            const { id } = request.params;
            const calendar = await db_1.prisma.calendar.findFirst({
                where: { id, userId: request.user.id },
            });
            if (!calendar) {
                return reply.status(404).send({ error: "Calendar not found" });
            }
            await db_1.prisma.calendar.delete({
                where: { id },
            });
            return reply.status(204).send();
        }
        catch (error) {
            return reply
                .status(500)
                .send({ error: "Failed to delete calendar" });
        }
    });
    fastify.post("/:id/sync", async (request, reply) => {
        try {
            const { id } = request.params;
            const calendar = await db_1.prisma.calendar.findFirst({
                where: { id, userId: request.user.id },
            });
            if (!calendar) {
                return reply.status(404).send({ error: "Calendar not found" });
            }
            // TODO: Implement actual sync logic based on calendar type
            await db_1.prisma.calendar.update({
                where: { id },
                data: { lastSync: new Date() },
            });
            return reply.send({ message: "Sync triggered" });
        }
        catch (error) {
            return reply.status(500).send({ error: "Failed to sync calendar" });
        }
    });
};
exports.default = calendarsRoutes;
