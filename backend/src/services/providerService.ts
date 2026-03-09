import type { Calendar } from "@prisma/client";
import { prisma } from "../utils/db";
import type { SyncResult, TestResult } from "../types";
import { getProviderHandler } from "../handlers/providers/registry";

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

export async function handleProviderDiscover(type: string, params: any) {
    const handler = getProviderHandler(type);
    if (!handler?.discover)
        return { error: "Provider not found or discover not supported" };
    return await handler.discover(params);
}
