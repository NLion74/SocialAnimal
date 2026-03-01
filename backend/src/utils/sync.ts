import { prisma } from "./db";
import type { SyncResult, TestResult } from "../types";
import { icsSync } from "../syncs/ics";
import { googleSync } from "../syncs/google";
import { caldavSync } from "../syncs/caldav";
import { icloudSync } from "../syncs/icloud";
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
        if (calendar.type === "ics")
            return await icsSync.syncCalendar(calendar as any);
        if (calendar.type === "google")
            return await googleSync.syncCalendar(calendar as any);
        if (calendar.type === "caldav")
            return await caldavSync.syncCalendar(calendar as any);
        if (calendar.type === "icloud")
            return await icloudSync.syncCalendar(calendar as any);
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
        return icsSync.testCalendar({
            type: calendar.type ?? "ics",
            config: config as {
                url: string;
                username?: string;
                password?: string;
            },
        });
    }

    if (type === "google" && config?.accessToken) {
        return googleSync.testCalendar({
            type: calendar.type ?? "google",
            config: config as {
                accessToken: string;
                refreshToken: string;
                calendarId: string;
            },
        });
    }

    if (type === "caldav" && config?.url) {
        return caldavSync.testCalendar({
            type: calendar.type ?? "caldav",
            config: config as {
                url: string;
                username: string;
                password: string;
                calendarPath?: string;
            },
        });
    }

    if (type === "icloud" && config?.username) {
        return icloudSync.testCalendar({
            type: calendar.type ?? "icloud",
            config: config as {
                username: string;
                password: string;
                calendarPath?: string;
            },
        });
    }

    return { success: false, error: `No test for type: ${type}` };
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
