import type { SharePermission } from "@prisma/client";
import { verifyToken } from "../utils/auth";
import { prisma } from "../utils/db";

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
