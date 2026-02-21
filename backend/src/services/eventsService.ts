import { prisma } from "../utils/db";
import type { SharePermission } from "@prisma/client";

export async function getEvents(opts: {
    userId: string;
    start?: string;
    end?: string;
    calendarId?: string;
}) {
    const where: any = { calendar: { userId: opts.userId } };

    if (opts.calendarId) where.calendarId = opts.calendarId;

    if (opts.start || opts.end) {
        where.startTime = {};
        if (opts.start) where.startTime.gte = new Date(opts.start);
        if (opts.end) where.startTime.lte = new Date(opts.end);
    }

    return prisma.event.findMany({
        where,
        include: {
            calendar: { select: { id: true, name: true, type: true } },
        },
        orderBy: { startTime: "asc" },
    });
}

export async function getFriendEvents(userId: string) {
    const shares = await prisma.calendarShare.findMany({
        where: { sharedWithId: userId },
        include: {
            calendar: {
                include: {
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                    events: {
                        include: {
                            calendar: {
                                select: { id: true, name: true, type: true },
                            },
                        },
                        orderBy: { startTime: "asc" },
                    },
                },
            },
        },
    });

    const out: Array<{
        event: any;
        permission: SharePermission;
        owner: any;
    }> = [];

    for (const share of shares) {
        const permission = share.permission as SharePermission;

        for (const event of share.calendar.events) {
            out.push({
                event,
                permission,
                owner: share.calendar.user,
            });
        }
    }

    return out;
}
