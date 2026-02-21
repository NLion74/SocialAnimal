import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { authenticateToken } from "../utils/auth";
import { applyPermission } from "../utils/permission";
import * as eventsService from "../services/eventsService";
import type { SharePermission } from "@prisma/client";

const authOptions: any = {
    preHandler: authenticateToken,
    schema: { security: [{ bearerAuth: [] }] },
};

const eventsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get(
        "/",
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const uid = request.user.id;
                const { start, end, calendarId } = request.query as any;

                const events = await eventsService.getEvents({
                    userId: uid,
                    start,
                    end,
                    calendarId,
                });

                return events;
            } catch (err) {
                fastify.log.error(err);
                return reply
                    .status(500)
                    .send({ error: "Failed to fetch events" });
            }
        },
    );

    fastify.get(
        "/friends",
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const uid = request.user.id;

                const sharedEvents = await eventsService.getFriendEvents(uid);

                const processed = sharedEvents.map(
                    (s: {
                        event: any;
                        permission: SharePermission;
                        owner: any;
                    }) =>
                        applyPermission(
                            {
                                ...s.event,
                                isFriend: true,
                                owner: s.owner,
                            },
                            s.permission,
                        ),
                );

                processed.sort(
                    (a: any, b: any) =>
                        new Date(a.startTime).getTime() -
                        new Date(b.startTime).getTime(),
                );

                return processed;
            } catch (err) {
                fastify.log.error(err);
                return reply
                    .status(500)
                    .send({ error: "Failed to fetch friend events" });
            }
        },
    );
};

export default eventsRoutes;
