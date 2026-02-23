import {
    FastifyPluginAsync,
    FastifyRequest,
    FastifyReply,
    RouteShorthandOptions,
} from "fastify";
import { authenticateToken } from "../utils/auth";
import * as calendarService from "../services/calendarService";
import { syncCalendar, testCalendarConnection } from "../utils/sync";
import { notFound, serverError } from "../utils/response";

const auth: RouteShorthandOptions & { schema?: any } = {
    preHandler: authenticateToken,
    schema: { security: [{ bearerAuth: [] }] },
};

const calendarsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get("/", auth, async (request: FastifyRequest) => {
        return calendarService.getUserCalendars(request.user.id);
    });

    fastify.put(
        "/:id",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as any;
                const { name, syncInterval, config } = request.body as any;

                const updated = await calendarService.updateCalendar({
                    userId: request.user.id,
                    calendarId: id,
                    name,
                    syncInterval,
                    config,
                });

                if (!updated) return notFound(reply, "Calendar not found");

                return updated;
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to update calendar");
            }
        },
    );

    fastify.delete(
        "/:id",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as any;
                const ok = await calendarService.deleteCalendar(
                    request.user.id,
                    id,
                );
                if (!ok) return notFound(reply, "Calendar not found");
                return reply.status(204).send();
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to delete calendar");
            }
        },
    );

    fastify.post(
        "/:id/sync",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as any;

                const calendar = await calendarService.findCalendarForUser(
                    id,
                    request.user.id,
                );
                if (!calendar) return notFound(reply, "Calendar not found");

                const result = await syncCalendar(id);
                if (!result.success)
                    return serverError(reply, result.error ?? "Sync failed");

                return {
                    message: "Sync complete",
                    eventsSynced: result.eventsSynced,
                };
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Sync failed");
            }
        },
    );

    fastify.get(
        "/:id/test",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as any;

                const calendar = await calendarService.findCalendarForUser(
                    id,
                    request.user.id,
                );
                if (!calendar) return notFound(reply, "Calendar not found");

                const result = await testCalendarConnection(calendar as any);

                if (result.success) {
                    return reply.status(200).send({
                        message: "Connection OK",
                        canConnect: true,
                        eventsPreview: result.eventsPreview,
                    });
                }

                return reply
                    .status(422)
                    .send({ error: result.error, canConnect: false });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Test failed");
            }
        },
    );
};

export default calendarsRoutes;
