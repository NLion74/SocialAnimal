import { prisma } from "./db";
import type { SyncResult, TestResult } from "../types";
import { syncIcsCalendar, testIcsConnection } from "../syncs/ics";
import type { Calendar } from "@prisma/client";

async function syncCalendar(calendarId: string): Promise<SyncResult> {
    console.log(`[sync] ${calendarId}`);

    const calendar = await prisma.calendar.findUnique({
        where: { id: calendarId },
        include: { user: { select: { email: true } } },
    });

    if (!calendar) {
        return { success: false, error: "Calendar not found" };
    }

    try {
        if (calendar.type === "ics") {
            return await syncIcsCalendar(calendar as any);
        }
        return { success: false, error: `Unsupported type: ${calendar.type}` };
    } catch (error) {
        console.error(`[sync:error] ${calendarId}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

async function testCalendarConnection(
    calendar: Partial<Calendar> & { type?: string; config?: any },
    type: string = calendar.type!,
): Promise<TestResult> {
    const config = calendar.config;

    if (type === "ics" && config?.url) {
        const icsConfig = calendar.config as {
            url: string;
            username?: string;
            password?: string;
        };

        return testIcsConnection({
            type: calendar.type ?? "ics",
            config: icsConfig,
        });
    }

    return {
        success: false,
        error: `No test for type: ${type}`,
    };
}

async function runDueCalendars() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const due = await prisma.calendar.findMany({
        where: {
            syncInterval: { gt: 0 },
            OR: [{ lastSync: null }, { lastSync: { lt: oneHourAgo } }],
        },
        select: { id: true },
    });

    console.log(`[cron:run] ${due.length} calendars due`);

    await Promise.allSettled(
        due.map((cal: { id: string }) => syncCalendar(cal.id)),
    );
}

export { syncCalendar, testCalendarConnection, runDueCalendars };
