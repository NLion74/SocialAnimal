import {
    FastifyPluginAsync,
    FastifyRequest,
    FastifyReply,
    RouteShorthandOptions,
} from "fastify";
import { authenticateToken } from "../utils/auth";
import * as calendarService from "../services/calendarService";
import { syncCalendar, testCalendarConnection } from "../utils/sync";
import { badRequest, notFound, serverError } from "../utils/response";

const authRouteOptions: RouteShorthandOptions & { schema?: any } = {
    preHandler: authenticateToken,
    schema: { security: [{ bearerAuth: [] }] },
};

const calendarsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get("/", authRouteOptions, async (request: FastifyRequest) => {
        const uid = request.user.id;
        return calendarService.getUserCalendars(uid);
    });

    fastify.post(
        "/",
        authRouteOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { name, type, url, config } = request.body as any;
                const uid = request.user.id;

                if (!name || !type) {
                    return badRequest(reply, "Name and type required");
                }

                const calendar = await calendarService.createCalendar({
                    userId: uid,
                    name,
                    type,
                    url,
                    config,
                });

                const syncResult = await syncCalendar(calendar.id);

                return {
                    calendar,
                    sync: syncResult,
                };
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to create calendar");
            }
        },
    );

    fastify.put(
        "/:id",
        authRouteOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as any;
                const { name, syncInterval, config } = request.body as any;
                const uid = request.user.id;

                const updated = await calendarService.updateCalendar({
                    userId: uid,
                    calendarId: id,
                    name,
                    syncInterval,
                    config,
                });

                if (!updated) {
                    return notFound(reply, "Calendar not found");
                }

                return updated;
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to update calendar");
            }
        },
    );

    fastify.delete(
        "/:id",
        authRouteOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as any;
                const uid = request.user.id;

                const ok = await calendarService.deleteCalendar(uid, id);

                if (!ok) {
                    return notFound(reply, "Calendar not found");
                }

                return reply.status(204).send();
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to delete calendar");
            }
        },
    );

    fastify.post(
        "/:id/sync",
        authRouteOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as any;
                const uid = request.user.id;

                const calendar = await calendarService.findCalendarForUser(
                    id,
                    uid,
                );

                if (!calendar) {
                    return notFound(reply, "Calendar not found");
                }

                const result = await syncCalendar(id);

                if (!result.success) {
                    return serverError(reply, result.error ?? "Sync failed");
                }

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
        authRouteOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { id } = request.params as any;
                const uid = request.user.id;

                const calendar = await calendarService.findCalendarForUser(
                    id,
                    uid,
                );
                if (!calendar) {
                    return notFound(reply, "Calendar not found");
                }

                const result = await testCalendarConnection(calendar as any);

                if (result.success) {
                    return reply.status(200).send({
                        message: "Connection OK",
                        canConnect: true,
                        eventsPreview: result.eventsPreview,
                    });
                }

                return reply.status(422).send({
                    error: result.error,
                    canConnect: false,
                });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Test failed");
            }
        },
    );

    fastify.post(
        "/test-connection",
        authRouteOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { type, config } = request.body as any;

                if (!type || !config?.url) {
                    return badRequest(reply, "Type and URL required");
                }

                const result = await testCalendarConnection({ type, config });

                if (result.success) {
                    return reply.status(200).send(result);
                }

                return reply.status(422).send({
                    error: result.error,
                    canConnect: false,
                });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Test failed");
            }
        },
    );
};

export default calendarsRoutes;
