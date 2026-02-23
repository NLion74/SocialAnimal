import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import * as icsService from "../services/icsService";
import { verifyToken } from "../utils/auth";

const tokenGuard = async (request: FastifyRequest, reply: FastifyReply) => {
    let token = (request.query as any).token;

    if (!token) {
        const authHeader = request.headers.authorization;
        if (authHeader?.startsWith("Bearer ")) {
            token = authHeader.substring(7);
        }
    }

    if (!token) {
        reply.status(401).send("Invalid or missing token");
        return null;
    }

    let userId: string;
    try {
        const decoded = verifyToken(token);
        userId = decoded.sub;
    } catch {
        const user = await icsService.userFromToken(token);
        if (!user) {
            reply.status(401).send("Invalid or missing token");
            return null;
        }
        return user;
    }

    const user = await icsService.getUserBasicInfo(userId);
    if (!user) {
        reply.status(401).send("Invalid or missing token");
        return null;
    }
    return user;
};

const icsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get(
        "/my-calendar.ics",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = await tokenGuard(request, reply);
            console.log("Generating ICS for user", user);
            if (!user) return;

            const events = await icsService.getUserEvents(user.id);
            const body = icsService.buildIcs("My Calendar", events);
            return icsService.icsReply(reply, "my-calendar.ics", body);
        },
    );

    fastify.get(
        "/calendar/:calendarId.ics",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = await tokenGuard(request, reply);
            console.log("Generating ICS for user", user);
            if (!user) return;

            const { calendarId } = request.params as any;
            const calendar = await icsService.findAccessibleCalendar(
                calendarId,
                user.id,
            );
            if (!calendar) return reply.status(404).send("Calendar not found");

            const events = await icsService.getEventsByCalendarId(calendarId);
            return icsService.icsReply(
                reply,
                `${calendar.name}.ics`,
                icsService.buildIcs(calendar.name, events),
            );
        },
    );

    fastify.get(
        "/friend/:friendUserId.ics",
        async (request: FastifyRequest, reply: FastifyReply) => {
            const user = await tokenGuard(request, reply);
            if (!user) return;

            const { friendUserId } = request.params as any;
            const ok = await icsService.ensureFriendship(user.id, friendUserId);
            if (!ok) return reply.status(403).send("Not friends");

            const sharedCalendarIds =
                await icsService.getSharedCalendarIdsForUser(
                    user.id,
                    friendUserId,
                );
            if (!sharedCalendarIds.length)
                return reply.status(403).send("No calendars shared with you");

            const events =
                await icsService.getEventsByCalendarIds(sharedCalendarIds);
            const friend = await icsService.getUserBasicInfo(friendUserId);
            return icsService.icsReply(
                reply,
                "shared.ics",
                icsService.buildIcs(
                    `${friend?.name ?? friend?.email}'s Calendar`,
                    events,
                ),
            );
        },
    );
};

export default icsRoutes;
