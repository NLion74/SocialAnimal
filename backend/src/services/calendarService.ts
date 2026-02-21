import { prisma } from "../utils/db";

interface CreateCalendarInput {
    userId: string;
    name: string;
    type: string;
    url?: string;
    config?: any;
}

interface UpdateCalendarInput {
    userId: string;
    calendarId: string;
    name?: string;
    syncInterval?: number;
    config?: any;
}

export async function getUserCalendars(userId: string) {
    return prisma.calendar.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
            shares: {
                select: {
                    sharedWithId: true,
                    permission: true,
                },
            },
            events: true,
        },
    });
}

export async function findCalendarForUser(calendarId: string, userId: string) {
    return prisma.calendar.findFirst({
        where: {
            id: calendarId,
            userId,
        },
        include: {
            shares: {
                select: {
                    sharedWithId: true,
                    permission: true,
                },
            },
        },
    });
}

export async function createCalendar(input: CreateCalendarInput) {
    const { userId, name, type, url, config } = input;

    return prisma.calendar.create({
        data: {
            userId,
            name,
            type,
            config: config ?? (url ? { url } : {}),
        },
    });
}

export async function updateCalendar(input: UpdateCalendarInput) {
    const { userId, calendarId, name, syncInterval, config } = input;

    const calendar = await prisma.calendar.findFirst({
        where: {
            id: calendarId,
            userId,
        },
    });

    if (!calendar) return null;

    return prisma.calendar.update({
        where: { id: calendarId },
        data: {
            ...(name !== undefined && { name }),
            ...(syncInterval !== undefined && { syncInterval }),
            ...(config !== undefined && { config }),
        },
    });
}

export async function deleteCalendar(
    userId: string,
    calendarId: string,
): Promise<boolean> {
    const calendar = await prisma.calendar.findFirst({
        where: {
            id: calendarId,
            userId,
        },
    });

    if (!calendar) return false;

    await prisma.$transaction([
        prisma.event.deleteMany({
            where: { calendarId },
        }),

        prisma.calendarShare.deleteMany({
            where: { calendarId },
        }),

        prisma.calendar.delete({
            where: { id: calendarId },
        }),
    ]);

    return true;
}

export async function userOwnsCalendar(
    userId: string,
    calendarId: string,
): Promise<boolean> {
    const count = await prisma.calendar.count({
        where: {
            id: calendarId,
            userId,
        },
    });

    return count > 0;
}
