import { prisma } from "../utils/db";

interface CreateCalendarInput {
    userId: string;
    name: string;
    type: string;
    url?: string;
    config?: any;
    syncInterval?: number;
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

    // validate sync interval against user/global minimum if provided
    if (input.syncInterval != null) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { syncIntervalOverride: true },
        });
        const app = await prisma.appSettings.findUnique({
            where: { id: "global" },
            select: { minSyncInterval: true },
        });
        const globalMin = app?.minSyncInterval ?? 0;
        const minAllowed = user?.syncIntervalOverride ?? globalMin;
        if (input.syncInterval < minAllowed) {
            throw new Error(`Sync interval must be ≥ ${minAllowed} minutes`);
        }
    }

    return prisma.calendar.create({
        data: {
            userId,
            name,
            type,
            config: config ?? (url ? { url } : {}),
            ...(input.syncInterval !== undefined && {
                syncInterval: input.syncInterval,
            }),
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

    // validate sync interval against user/global minimum if provided
    if (syncInterval !== undefined && syncInterval != null) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { syncIntervalOverride: true },
        });
        const app = await prisma.appSettings.findUnique({
            where: { id: "global" },
            select: { minSyncInterval: true },
        });
        const globalMin = app?.minSyncInterval ?? 0;
        const minAllowed = user?.syncIntervalOverride ?? globalMin;
        if (syncInterval < minAllowed) {
            throw new Error(`Sync interval must be ≥ ${minAllowed} minutes`);
        }
    }

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
