import type { SharePermission } from "@prisma/client";
import { verifyToken } from "../../utils/auth";
import { prisma } from "../../utils/db";

export interface Syncable {
    sync(calendarId: string, userId?: string): Promise<any>;
}
export interface Testable {
    test(credentials: any): Promise<any>;
}
export interface Discoverable {
    discover(params?: any): Promise<any>;
}
export interface Importable {
    import(data: any): Promise<any>;
}
export interface Exportable {
    export(data: any): Promise<any>;
}
export interface Authorizable {
    getAuthUrl(params?: any): Promise<string | { url: string }>;
}

export interface ProviderHandler {
    sync?: (calendarId: string, userId?: string) => Promise<any>;
    test?: (credentials: any) => Promise<any>;
    discover?: (params?: any) => Promise<any>;
    import?: (data: any) => Promise<any>;
    export?: (data: any) => Promise<any>;
    getAuthUrl?: (params?: any) => Promise<string | { url: string }>;
}

export type ExportAccess = {
    allowed: boolean;
    permission: SharePermission;
    userId?: string;
};

export async function resolveShareExportAccess(
    calendarId: string,
    token?: string,
): Promise<ExportAccess> {
    if (!token) {
        return { allowed: false, permission: "busy" };
    }

    let userId: string;
    try {
        userId = verifyToken(token).sub;
    } catch {
        return { allowed: false, permission: "busy" };
    }

    const calendar = await prisma.calendar.findUnique({
        where: { id: calendarId },
        select: {
            userId: true,
            shares: {
                where: { sharedWithId: userId },
                select: { permission: true },
            },
        },
    });

    if (!calendar) {
        return { allowed: false, permission: "busy", userId };
    }

    if (calendar.userId === userId) {
        return { allowed: true, permission: "full", userId };
    }

    const share = calendar.shares[0];
    if (!share) {
        return { allowed: false, permission: "busy", userId };
    }

    return {
        allowed: true,
        permission: share.permission as SharePermission,
        userId,
    };
}

export function maskExportEventFields<
    T extends {
        title?: string | null;
        description?: string | null;
        location?: string | null;
    },
>(
    event: T,
    permission: SharePermission,
): T & { title: string; description: string | null; location: string | null } {
    if (permission === "full") {
        return {
            ...event,
            title: event.title || "Untitled",
            description: event.description ?? null,
            location: event.location ?? null,
        };
    }

    if (permission === "titles") {
        return {
            ...event,
            title: event.title || "Untitled",
            description: null,
            location: null,
        };
    }

    return {
        ...event,
        title: "Busy",
        description: null,
        location: null,
    };
}

export async function getUserLimits(userId: string): Promise<{
    maxCalendars: number;
    minSyncInterval: number;
}> {
    const [user, settings] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: { maxCalendarsOverride: true, syncIntervalOverride: true },
        }),
        prisma.appSettings.findUnique({
            where: { id: "global" },
            select: { maxCalendarsPerUser: true, minSyncInterval: true },
        }),
    ]);

    const globalMaxCalendars = settings?.maxCalendarsPerUser ?? 10;
    const globalMinSync = settings?.minSyncInterval ?? 15;

    return {
        maxCalendars: user?.maxCalendarsOverride ?? globalMaxCalendars,
        minSyncInterval: user?.syncIntervalOverride ?? globalMinSync,
    };
}

export async function checkCalendarLimit(userId: string): Promise<{
    allowed: boolean;
    current: number;
    max: number;
}> {
    const { maxCalendars } = await getUserLimits(userId);
    const current = await prisma.calendar.count({ where: { userId } });
    return { allowed: current < maxCalendars, current, max: maxCalendars };
}
