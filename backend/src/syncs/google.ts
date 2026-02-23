import type { SyncResult, TestResult } from "../types";
import { env } from "../utils/env";
import { prisma } from "../utils/db";
import type { CalendarWithUser } from "../types";

export interface GoogleConfig {
    accessToken: string;
    refreshToken: string;
    calendarId: string;
}

interface GoogleEvent {
    id: string;
    summary?: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
    status?: string;
}

function getGoogleConfig(config: unknown): GoogleConfig | null {
    if (!config || typeof config !== "object") return null;
    const c = config as any;
    if (typeof c.accessToken !== "string") return null;
    if (typeof c.refreshToken !== "string") return null;
    if (typeof c.calendarId !== "string") return null;
    return {
        accessToken: c.accessToken,
        refreshToken: c.refreshToken,
        calendarId: c.calendarId,
    };
}

export async function refreshGoogleAccessToken(
    refreshToken: string,
): Promise<string> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: env.google.clientId!,
            client_secret: env.google.clientSecret!,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
        }),
    });

    if (!res.ok) throw new Error(`Failed to refresh token: ${res.status}`);

    const data = (await res.json()) as any;
    if (!data.access_token)
        throw new Error("No access token in refresh response");

    return data.access_token;
}

export async function fetchGoogleEvents(
    accessToken: string,
    calendarId: string,
): Promise<GoogleEvent[]> {
    const url = `${env.google.apiUrl}/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 401)
        throw new Error("Unauthorized: access token expired or invalid");
    if (!res.ok) throw new Error(`Google API error: ${res.status}`);

    const data = (await res.json()) as any;
    return (data.items ?? []) as GoogleEvent[];
}

export async function syncGoogleCalendar(
    calendar: CalendarWithUser,
): Promise<SyncResult> {
    const calendarConfig = getGoogleConfig(calendar.config);
    if (!calendarConfig) {
        await prisma.calendar.update({
            where: { id: calendar.id },
            data: { lastSync: new Date() },
        });
        return {
            success: false,
            error: "Invalid Google config",
            eventsSynced: 0,
        };
    }

    let accessToken = calendarConfig.accessToken;

    let events: GoogleEvent[];
    try {
        events = await fetchGoogleEvents(
            accessToken,
            calendarConfig.calendarId,
        );
    } catch (err: any) {
        if (!err?.message?.includes("Unauthorized")) {
            return {
                success: false,
                error: err?.message ?? "Failed to fetch events",
                eventsSynced: 0,
            };
        }

        try {
            accessToken = await refreshGoogleAccessToken(
                calendarConfig.refreshToken,
            );
            await prisma.calendar.update({
                where: { id: calendar.id },
                data: { config: { ...calendarConfig, accessToken } },
            });
            events = await fetchGoogleEvents(
                accessToken,
                calendarConfig.calendarId,
            );
        } catch (refreshErr: any) {
            return {
                success: false,
                error: refreshErr?.message ?? "Token refresh failed",
                eventsSynced: 0,
            };
        }
    }

    if (!events.length) {
        await prisma.calendar.update({
            where: { id: calendar.id },
            data: { lastSync: new Date() },
        });
        return { success: false, error: "No events found", eventsSynced: 0 };
    }

    const uids = events.map((e) => e.id);
    let createdCount = 0;

    try {
        await prisma.$transaction(async (tx: any) => {
            const result = await tx.event.createMany({
                data: events.map((e) => {
                    const allDay = !e.start.dateTime;
                    return {
                        calendarId: calendar.id,
                        externalId: e.id,
                        title: e.summary ?? "Untitled",
                        description: e.description ?? null,
                        location: e.location ?? null,
                        startTime: new Date(e.start.dateTime ?? e.start.date!),
                        endTime: new Date(e.end.dateTime ?? e.end.date!),
                        allDay,
                    };
                }),
                skipDuplicates: true,
            });
            createdCount = result.count;

            await tx.event.deleteMany({
                where: { calendarId: calendar.id, externalId: { notIn: uids } },
            });

            await tx.calendar.update({
                where: { id: calendar.id },
                data: { lastSync: new Date() },
            });
        });

        return { success: true, eventsSynced: createdCount };
    } catch {
        return {
            success: false,
            error: "Database error during sync",
            eventsSynced: 0,
        };
    }
}

export async function testGoogleConnection(calendar: {
    type: string;
    config: { accessToken: string; refreshToken: string; calendarId: string };
}): Promise<TestResult> {
    if (calendar.type !== "google")
        return { success: false, canConnect: false, error: "Unsupported type" };

    const calendarConfig = getGoogleConfig(calendar.config);
    if (!calendarConfig)
        return {
            success: false,
            canConnect: false,
            error: "Invalid Google config",
        };

    try {
        const events = await fetchGoogleEvents(
            calendarConfig.accessToken,
            calendarConfig.calendarId,
        );

        return {
            success: true,
            canConnect: true,
            eventsPreview: events.slice(0, 5).map((e) => e.summary ?? ""),
        };
    } catch (err: any) {
        return {
            success: false,
            canConnect: false,
            error: err?.message ?? "Failed to connect",
        };
    }
}
