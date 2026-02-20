import { FastifyPluginAsync } from "fastify";
import { prisma } from "../utils/db";
import { verifyToken } from "../utils/auth";
import icalGenerator from "ical-generator";

async function userFromToken(token: string | undefined) {
    if (!token) return null;
    try {
        const payload = verifyToken(token);
        return await prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true },
        });
    } catch {
        return null;
    }
}

function buildIcs(name: string, events: any[]): string {
    const cal = icalGenerator({ name, timezone: "UTC" });
    for (const e of events) {
        cal.createEvent({
            start: e.startTime,
            end: e.endTime,
            allDay: e.allDay,
            summary: e.title,
            description: e.description ?? undefined,
            location: e.location ?? undefined,
            uid: e.id,
            stamp: e.createdAt,
        });
    }
    return cal.toString();
}

function icsReply(reply: any, filename: string, body: string) {
    reply.header("Content-Type", "text/calendar; charset=utf-8");
    reply.header("Content-Disposition", `inline; filename="${filename}"`);
    return reply.send(body);
}

const icsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get("/my-calendar.ics", async (request, reply) => {
        const { token } = request.query as any;
        const user = await userFromToken(token);
        if (!user) return reply.status(401).send("Invalid or missing token");
        const events = await prisma.event.findMany({
            where: { calendar: { userId: user.id } },
            orderBy: { startTime: "asc" },
        });
        return icsReply(
            reply,
            "my-calendar.ics",
            buildIcs("My Calendar", events),
        );
    });

    fastify.get("/calendar/:calendarId.ics", async (request, reply) => {
        const { calendarId } = request.params as any;
        const { token } = request.query as any;
        const user = await userFromToken(token);
        if (!user) return reply.status(401).send("Invalid or missing token");

        const calendar = await prisma.calendar.findFirst({
            where: {
                id: calendarId,
                OR: [
                    { userId: user.id },
                    { shares: { some: { sharedWithId: user.id } } },
                ],
            },
        });
        if (!calendar) return reply.status(404).send("Calendar not found");

        const events = await prisma.event.findMany({
            where: { calendarId },
            orderBy: { startTime: "asc" },
        });
        return icsReply(
            reply,
            `${calendar.name}.ics`,
            buildIcs(calendar.name, events),
        );
    });

    fastify.get("/friend/:friendUserId.ics", async (request, reply) => {
        const { friendUserId } = request.params as any;
        const { token } = request.query as any;
        const user = await userFromToken(token);
        if (!user) return reply.status(401).send("Invalid or missing token");

        const friendship = await prisma.friendship.findFirst({
            where: {
                status: "accepted",
                OR: [
                    { user1Id: user.id, user2Id: friendUserId },
                    { user1Id: friendUserId, user2Id: user.id },
                ],
            },
        });
        if (!friendship) return reply.status(403).send("Not friends");

        const shares = await prisma.calendarShare.findMany({
            where: {
                sharedWithId: user.id,
                calendar: { userId: friendUserId },
            },
            select: { calendarId: true },
        });
        if (shares.length === 0)
            return reply.status(403).send("No calendars shared with you");

        const events = await prisma.event.findMany({
            where: { calendarId: { in: shares.map((s: any) => s.calendarId) } },
            orderBy: { startTime: "asc" },
        });
        const friend = await prisma.user.findUnique({
            where: { id: friendUserId },
            select: { name: true, email: true },
        });
        return icsReply(
            reply,
            "shared.ics",
            buildIcs(`${friend?.name ?? friend?.email}'s Calendar`, events),
        );
    });
};

export default icsRoutes;
