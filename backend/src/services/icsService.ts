import { prisma } from "../utils/db";
import { verifyToken } from "../utils/auth";
import icalGenerator from "ical-generator";
import type { FastifyReply } from "fastify";

export async function userFromToken(token: string | undefined) {
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

export function buildIcs(name: string, events: any[]): string {
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

export function icsReply(reply: FastifyReply, filename: string, body: string) {
    reply.header("Content-Type", "text/calendar; charset=utf-8");
    reply.header("Content-Disposition", `inline; filename="${filename}"`);
    return reply.send(body);
}

export async function getUserEvents(userId: string) {
    return prisma.event.findMany({
        where: { calendar: { userId } },
        orderBy: { startTime: "asc" },
    });
}

export async function getEventsByCalendarId(calendarId: string) {
    return prisma.event.findMany({
        where: { calendarId },
        orderBy: { startTime: "asc" },
    });
}

export async function getEventsByCalendarIds(ids: string[]) {
    return prisma.event.findMany({
        where: { calendarId: { in: ids } },
        orderBy: { startTime: "asc" },
    });
}

export async function findAccessibleCalendar(
    calendarId: string,
    userId: string,
) {
    return prisma.calendar.findFirst({
        where: {
            id: calendarId,
            OR: [{ userId }, { shares: { some: { sharedWithId: userId } } }],
        },
    });
}

export async function ensureFriendship(userId: string, friendUserId: string) {
    const friendship = await prisma.friendship.findFirst({
        where: {
            status: "accepted",
            OR: [
                { user1Id: userId, user2Id: friendUserId },
                { user1Id: friendUserId, user2Id: userId },
            ],
        },
    });
    return !!friendship;
}

export async function getSharedCalendarIdsForUser(
    sharedWithId: string,
    ownerId: string,
) {
    const shares = await prisma.calendarShare.findMany({
        where: { sharedWithId, calendar: { userId: ownerId } },
        select: { calendarId: true },
    });
    return shares.map((s: { calendarId: string }) => s.calendarId);
}

export async function getUserBasicInfo(userId: string) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
    });
}
