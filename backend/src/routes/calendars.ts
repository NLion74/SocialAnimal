import { FastifyPluginAsync } from "fastify";
import { authenticateToken } from "../utils/auth";
import { syncCalendar } from "../utils/sync";
import {
    getUserCalendars,
    findCalendarForUser,
} from "../services/calendarService";
import { prisma } from "../utils/db";
import { notFound, serverError } from "../utils/response";

const calendarsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.addHook("preHandler", authenticateToken);

    fastify.get("/", async (request) => {
        const uid = (request as any).user.id;
        return getUserCalendars(uid);
    });

    fastify.post(
        "/",
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const { name, type, url, config } = request.body as any;

                if (!name || !type) {
                    return reply
                        .status(400)
                        .send({ error: "Name and type required" });
                }

                const calendar = await prisma.calendar.create({
                    data: {
                        userId: (request as any).user.id,
                        name,
                        type,
                        config: config ?? (url ? { url } : {}),
                    },
                });

                syncCalendar(calendar.id).catch((err) =>
                    console.error(
                        `[sync] initial sync failed for calendar ${calendar.id}:`,
                        err,
                    ),
                );

                return reply.status(201).send(calendar);
            } catch (error: any) {
                console.error(
                    "[calendar:create] Error creating calendar:",
                    error,
                );

                return reply
                    .status(500)
                    .send({ error: "Failed to create calendar" });
            }
        },
    );

    fastify.put("/:id", async (request, reply) => {
        try {
            const { id } = request.params as any;
            const uid = (request as any).user.id;
            const { name, syncInterval, config } = request.body as any;

            const cal = await prisma.calendar.findFirst({
                where: { id, userId: uid },
            });
            if (!cal) return notFound(reply, "Calendar not found");

            const updated = await prisma.calendar.update({
                where: { id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(syncInterval !== undefined && { syncInterval }),
                    ...(config !== undefined && { config }),
                },
            });

            return reply.send(updated);
        } catch (err) {
            fastify.log.error(err);
            return serverError(reply, "Failed to update calendar");
        }
    });

    fastify.delete("/:id", async (request, reply) => {
        try {
            const { id } = request.params as any;
            const cal = await prisma.calendar.findFirst({
                where: { id, userId: (request as any).user.id },
            });
            if (!cal) return notFound(reply, "Calendar not found");
            await prisma.calendar.delete({ where: { id } });
            return reply.status(204).send();
        } catch {
            return serverError(reply, "Failed to delete calendar");
        }
    });

    fastify.post(
        "/:id/sync",
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const { id } = request.params as any;
                const calendar = await findCalendarForUser(
                    id,
                    (request as any).user.id,
                );
                if (!calendar)
                    return reply
                        .status(404)
                        .send({ error: "Calendar not found" });

                await syncCalendar(id);
                return reply.send({ message: "Sync complete" });
            } catch (err) {
                fastify.log.error(err);
                return reply.status(500).send({ error: "Sync failed" });
            }
        },
    );
};

export default calendarsRoutes;
