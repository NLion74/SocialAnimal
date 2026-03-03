import { prisma } from "../utils/db";
import type { SyncResult, TestResult } from "../types";
import type { Calendar } from "@prisma/client";
import { getProviderHandler } from "../handlers/registry";

export async function syncCalendar(calendarId: string): Promise<SyncResult> {
    const calendar = await prisma.calendar.findUnique({
        where: { id: calendarId },
        include: { user: { select: { email: true } } },
    });

    if (!calendar) {
        return { success: false, error: "Calendar not found" };
    }

    const handler = getProviderHandler(calendar.type!);
    if (!handler?.sync) {
        return {
            success: false,
            error: `Sync not supported for type: ${calendar.type}`,
        };
    }

    return handler.sync(calendarId, calendar.user?.email);
}

export async function runDueCalendars(): Promise<void> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const due = await prisma.calendar.findMany({
        where: {
            syncInterval: { gt: 0 },
            OR: [{ lastSync: null }, { lastSync: { lt: oneHourAgo } }],
        },
        select: { id: true },
    });

    await Promise.allSettled(
        due.map((cal: { id: string }) => syncCalendar(cal.id)),
    );
}

export async function testCalendarConnection(
    calendar: Partial<Calendar> & { type?: string; config?: any },
    type: string = calendar.type!,
): Promise<TestResult> {
    const handler = getProviderHandler(type);
    if (!handler?.test) {
        return { success: false, error: `No test for type: ${type}` };
    }
    return handler.test(calendar.config);
}
