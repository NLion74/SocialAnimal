import type { Calendar } from "@prisma/client";
import { prisma } from "../utils/db";
import type { SyncResult, TestResult } from "../types";
import { getProviderHandler } from "../handlers/providers/registry";
import { getUserLimits } from "../handlers/providers/base";

export async function handleProviderImport(type: string, data: any) {
    const handler = getProviderHandler(type);
    if (!handler?.import) {
        return { error: "Provider not found or import not supported" };
    }
    return handler.import(data);
}

export async function handleProviderAuthUrl(type: string, params?: any) {
    const handler = getProviderHandler(type);
    if (!handler?.getAuthUrl) {
        return { error: "Provider not found or auth url not supported" };
    }
    const url = await handler.getAuthUrl(params);
    return typeof url === "string" ? { url } : url;
}

export async function handleProviderTest(type: string, credentials: any) {
    const handler = getProviderHandler(type);
    if (!handler?.test) {
        return { error: "Provider not found or test not supported" };
    }
    return handler.test(credentials);
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

export async function handleProviderExport(type: string, params: any) {
    const handler = getProviderHandler(type);
    if (!handler?.export)
        return { error: "Provider not found or export not supported" };
    return await handler.export(params);
}

export async function runDueCalendars(): Promise<void> {
    const now = new Date();

    const candidates = await prisma.calendar.findMany({
        where: { syncInterval: { gt: 0 } },
        select: { id: true, userId: true, syncInterval: true, lastSync: true },
    });

    const due = await Promise.all(
        candidates.map(async (cal: any) => {
            const { minSyncInterval } = await getUserLimits(cal.userId);
            const effectiveInterval = Math.max(
                cal.syncInterval,
                minSyncInterval,
            );
            if (!cal.lastSync) return cal;
            const elapsedMinutes =
                (now.getTime() - cal.lastSync.getTime()) / 60_000;
            return elapsedMinutes >= effectiveInterval ? cal : null;
        }),
    );

    await Promise.allSettled(
        due
            .filter((cal): cal is NonNullable<typeof cal> => cal !== null)
            .map((cal) => syncCalendar(cal.id)),
    );
}

export async function handleProviderDiscover(type: string, params: any) {
    const handler = getProviderHandler(type);
    if (!handler?.discover)
        return { error: "Provider not found or discover not supported" };
    return await handler.discover(params);
}
