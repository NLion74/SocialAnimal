import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SubscriptionExporter } from "../../../exports/subscription/base";
import * as exportService from "../../../services/exportService";
import { authenticateToken } from "../../../utils/auth";

const authOptions = { preHandler: authenticateToken };

export function registerSubscriptionRoutes(
    fastify: FastifyInstance,
    exporter: SubscriptionExporter,
) {
    const ext = exporter.fileExtension;

    fastify.get(
        `/my-calendar.${ext}`,
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = (request as any).user;
            const events = await exportService.getUserEvents(user.id);
            exporter.sendReply(
                reply,
                "my-calendar",
                exporter.serialize({
                    calendarName: "My Calendar",
                    events,
                    permission: "full",
                }),
            );
        },
    );

    fastify.get(
        `/calendar/:calendarId.${ext}`,
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = (request as any).user;
            const { calendarId } = request.params as any;
            const calendar = await exportService.findAccessibleCalendar(
                calendarId,
                user.id,
            );
            if (!calendar) return reply.status(404).send("Calendar not found");

            const events =
                await exportService.getEventsByCalendarId(calendarId);
            exporter.sendReply(
                reply,
                calendar.name,
                exporter.serialize({
                    calendarName: calendar.name,
                    events,
                    permission: "full",
                }),
            );
        },
    );

    fastify.get(
        `/friend/:friendUserId.${ext}`,
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = (request as any).user;
            const { friendUserId } = request.params as any;

            const ok = await exportService.ensureFriendship(
                user.id,
                friendUserId,
            );
            if (!ok) return reply.status(403).send("Not friends");

            const sharedCalendars = await exportService.getSharedCalendars(
                user.id,
                friendUserId,
            );
            if (!sharedCalendars.length)
                return reply.status(403).send("No calendars shared with you");

            const allEvents = (
                await Promise.all(
                    sharedCalendars.map(async ({ calendarId, permission }) => {
                        const events =
                            await exportService.getEventsByCalendarId(
                                calendarId,
                            );
                        return exporter.maskAll(events, permission);
                    }),
                )
            ).flat();

            const friend = await exportService.getUserBasicInfo(friendUserId);
            const friendName = friend?.name ?? friend?.email ?? "Unknown";

            exporter.sendReply(
                reply,
                friendName,
                exporter.serialize({
                    calendarName: friendName,
                    events: allEvents,
                    permission: "full",
                }),
            );
        },
    );

    fastify.get(
        `/friend/:friendUserId/:calendarId.${ext}`,
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = (request as any).user;
            const { friendUserId, calendarId } = request.params as any;

            const ok = await exportService.ensureFriendship(
                user.id,
                friendUserId,
            );
            if (!ok) return reply.status(403).send("Not friends");

            const sharedCalendars = await exportService.getSharedCalendars(
                user.id,
                friendUserId,
            );

            const shared = sharedCalendars.find(
                (c) => c.calendarId === calendarId,
            );
            if (!shared)
                return reply.status(403).send("Calendar not shared with you");

            const [events, calendar, friend] = await Promise.all([
                exportService.getEventsByCalendarId(calendarId),
                exportService.findAccessibleCalendar(calendarId, user.id),
                exportService.getUserBasicInfo(friendUserId),
            ]);

            const masked = exporter.maskAll(events, shared.permission);
            const friendName = friend?.name ?? friend?.email ?? "Unknown";
            const calendarName = `${friendName} - ${calendar?.name ?? calendarId}`;

            exporter.sendReply(
                reply,
                calendarName,
                exporter.serialize({
                    calendarName,
                    events: masked,
                    permission: shared.permission,
                }),
            );
        },
    );
}
