import { prisma } from "../utils/db";
import { verifyToken } from "../utils/auth";
import type { CalendarEvent } from "../exports/subscription/base";
import type { SharePermission } from "@prisma/client";

function maskEvents(
    events: CalendarEvent[],
    permission: SharePermission,
): CalendarEvent[] {
    if (permission === "full") return events;
    return events.map((e) => ({
        ...e,
        title: permission === "busy" ? "Busy" : e.title,
        description: null,
        location: null,
    }));
}

export async function userFromToken(token: string | undefined) {
    if (!token) return null;
    try {
        const payload = verifyToken(token);
        return await prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, name: true, email: true },
        });
    } catch {
        return null;
    }
}

export async function getUserBasicInfo(userId: string) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
    });
}

export async function getUserEvents(userId: string): Promise<CalendarEvent[]> {
    return prisma.event.findMany({
        where: { calendar: { userId } },
        orderBy: { startTime: "asc" },
        select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            allDay: true,
            description: true,
            location: true,
            createdAt: true,
        },
    });
}

export async function getEventsByCalendarId(
    calendarId: string,
): Promise<CalendarEvent[]> {
    return prisma.event.findMany({
        where: { calendarId },
        orderBy: { startTime: "asc" },
        select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            allDay: true,
            description: true,
            location: true,
            createdAt: true,
        },
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
        select: { id: true, name: true, userId: true },
    });
}

export async function ensureFriendship(
    userId: string,
    friendUserId: string,
): Promise<boolean> {
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

export async function getSharedCalendars(
    sharedWithId: string,
    ownerId: string,
): Promise<{ calendarId: string; permission: SharePermission }[]> {
    const shares =
        (await prisma.calendarShare.findMany({
            where: {
                sharedWithId,
                calendar: { userId: ownerId },
            },
            select: {
                calendarId: true,
                permission: true,
            },
        })) ?? [];
    return shares.map((s: any) => ({
        calendarId: s.calendarId,
        permission: s.permission ?? "full",
    }));
}

export async function getSharedEventsForUser(
    userId: string,
): Promise<CalendarEvent[]> {
    const shares =
        (await prisma.calendarShare.findMany({
            where: { sharedWithId: userId },
            select: {
                calendarId: true,
                permission: true,
            },
        })) ?? [];

    const eventsByCalendar = await Promise.all(
        shares.map(
            async ({
                calendarId,
                permission,
            }: {
                calendarId: string;
                permission: SharePermission;
            }) => {
                const events = await getEventsByCalendarId(calendarId);
                const effectivePermission = permission ?? "full";
                return maskEvents(events, effectivePermission);
            },
        ),
    );

    return eventsByCalendar.flat();
}
