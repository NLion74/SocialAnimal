import { ProviderHandler } from "./base";
import type { CalendarWithUser, SyncResult } from "../types";
import { env, isGoogleConfigured } from "../utils/env";
import { prisma } from "../utils/db";
import * as calendarService from "../services/calendarService";

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
}

class GoogleCalendarSync {
    private getConfig(config: any): GoogleConfig {
        if (!this.validateConfig(config)) {
            throw new Error("Invalid Google config");
        }
        return config as GoogleConfig;
    }

    private validateConfig(config: any): boolean {
        if (!config || typeof config !== "object") return false;
        return (
            typeof config.accessToken === "string" &&
            typeof config.refreshToken === "string" &&
            typeof config.calendarId === "string"
        );
    }

    private async refreshAccessToken(refreshToken: string): Promise<string> {
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
        if (!data.access_token) {
            throw new Error("No access token in refresh response");
        }

        return data.access_token;
    }

    private async fetchGoogleEvents(
        accessToken: string,
        calendarId: string,
    ): Promise<GoogleEvent[]> {
        let allEvents: GoogleEvent[] = [];
        let pageToken: string | undefined;

        do {
            const params = new URLSearchParams({
                singleEvents: "true",
                orderBy: "startTime",
                maxResults: "2500",
            });

            if (pageToken) {
                params.set("pageToken", pageToken);
            }

            const url = `${env.google.apiUrl}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (res.status === 401) {
                throw new Error(
                    "Unauthorized: access token expired or invalid",
                );
            }
            if (!res.ok) {
                throw new Error(`Google API error: ${res.status}`);
            }

            const data = (await res.json()) as any;
            allEvents = allEvents.concat(data.items ?? []);
            pageToken = data.nextPageToken;
        } while (pageToken);

        return allEvents;
    }

    private async fetchEvents(
        calendar: CalendarWithUser,
    ): Promise<GoogleEvent[]> {
        const config = this.getConfig(calendar.config);
        let accessToken = config.accessToken;

        try {
            return await this.fetchGoogleEvents(accessToken, config.calendarId);
        } catch (err: any) {
            if (!err?.message?.includes("Unauthorized")) {
                throw err;
            }

            accessToken = await this.refreshAccessToken(config.refreshToken);
            await prisma.calendar.update({
                where: { id: calendar.id },
                data: { config: { ...config, accessToken } as any },
            });

            return await this.fetchGoogleEvents(accessToken, config.calendarId);
        }
    }

    async syncCalendar(calendar: CalendarWithUser): Promise<SyncResult> {
        let events: GoogleEvent[];

        try {
            events = await this.fetchEvents(calendar);
        } catch (error) {
            await prisma.calendar.update({
                where: { id: calendar.id },
                data: { lastSync: new Date() },
            });
            return {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch events",
                eventsSynced: 0,
            };
        }

        if (!events.length) {
            await prisma.calendar.update({
                where: { id: calendar.id },
                data: { lastSync: new Date() },
            });
            return { success: true, eventsSynced: 0 };
        }

        const externalIds = events.map((e) => e.id);
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
                            startTime: new Date(
                                e.start.dateTime ?? e.start.date!,
                            ),
                            endTime: new Date(e.end.dateTime ?? e.end.date!),
                            allDay,
                        };
                    }),
                    skipDuplicates: true,
                });
                createdCount = result.count;

                await tx.event.deleteMany({
                    where: {
                        calendarId: calendar.id,
                        externalId: { notIn: externalIds },
                    },
                });

                await tx.calendar.update({
                    where: { id: calendar.id },
                    data: { lastSync: new Date() },
                });
            });

            return { success: true, eventsSynced: createdCount };
        } catch (error) {
            console.error(`[google:sync:error] ${calendar.id}:`, error);
            return {
                success: false,
                error: "Database error during sync",
                eventsSynced: 0,
            };
        }
    }

    async testCalendar(calendar: {
        type: string;
        config: GoogleConfig;
    }): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        if (calendar.type !== "google") {
            return { success: false, error: "Unsupported type" };
        }

        if (!this.validateConfig(calendar.config)) {
            return { success: false, error: "Invalid Google config" };
        }

        try {
            const events = await this.fetchGoogleEvents(
                calendar.config.accessToken,
                calendar.config.calendarId,
            );
            return {
                success: true,
                eventsPreview: events
                    .slice(0, 5)
                    .map((e) => e.summary || "")
                    .filter(Boolean),
            };
        } catch (err: any) {
            return {
                success: false,
                error: err?.message ?? "Failed to connect",
            };
        }
    }
}

const googleSync = new GoogleCalendarSync();

async function exchangeGoogleCode(
    code: string,
): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code,
            client_id: env.google.clientId!,
            client_secret: env.google.clientSecret!,
            redirect_uri: env.google.redirectUri!,
            grant_type: "authorization_code",
        }),
    });

    if (!res.ok) throw new Error("token-exchange-failed");

    const data = (await res.json()) as any;
    if (!data.access_token) throw new Error("token-exchange-failed");

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? "",
    };
}

async function fetchGoogleCalendars(
    accessToken: string,
): Promise<Array<{ id: string; summary: string }>> {
    const res = await fetch(`${env.google.apiUrl}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) throw new Error("calendar-fetch-failed");

    const data = (await res.json()) as any;
    if (!data.items?.length) throw new Error("no-calendars-found");

    return data.items.map((cal: any) => ({
        id: cal.id,
        summary: cal.summary || "Unnamed Calendar",
    }));
}

export class GoogleHandler implements ProviderHandler {
    async getAuthUrl(params?: { userId?: string }): Promise<string> {
        if (!isGoogleConfigured()) {
            throw new Error("not-configured");
        }

        const userId = params?.userId;
        if (!userId) throw new Error("missing-user-id");

        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.searchParams.set("client_id", env.google.clientId!);
        url.searchParams.set("redirect_uri", env.google.redirectUri!);
        url.searchParams.set("response_type", "code");
        url.searchParams.set(
            "scope",
            "https://www.googleapis.com/auth/calendar.readonly",
        );
        url.searchParams.set("access_type", "offline");
        url.searchParams.set("prompt", "consent");
        url.searchParams.set("state", userId);

        return url.toString();
    }

    async discover(params?: any): Promise<any> {
        try {
            if (params?.accessToken) {
                const calendars = await fetchGoogleCalendars(
                    params.accessToken,
                );
                return { calendars };
            }

            if (params?.code) {
                const tokens = await exchangeGoogleCode(params.code);
                const calendars = await fetchGoogleCalendars(
                    tokens.accessToken,
                );
                return { calendars, ...tokens };
            }

            return { error: "accessToken or code is required" };
        } catch (error: any) {
            return { error: error?.message ?? "discover-failed" };
        }
    }

    async sync(calendarId: string): Promise<SyncResult> {
        const calendar = await prisma.calendar.findUnique({
            where: { id: calendarId },
            include: { user: { select: { email: true } } },
        });

        if (!calendar) {
            return {
                success: false,
                error: "Calendar not found",
                eventsSynced: 0,
            };
        }

        return googleSync.syncCalendar(calendar as CalendarWithUser);
    }

    async test(credentials: any): Promise<any> {
        return googleSync.testCalendar({ type: "google", config: credentials });
    }

    async import(data: any): Promise<any> {
        try {
            if (data?.mode === "callback") {
                const userId = data.userId || data.state;
                if (!userId || !data.code) {
                    return { error: "missing userId/state or code" };
                }
                const tokens = await exchangeGoogleCode(data.code);
                const calendars = await fetchGoogleCalendars(
                    tokens.accessToken,
                );
                const imported = [];
                for (const cal of calendars) {
                    imported.push(
                        await this.import({
                            userId,
                            calendarId: cal.id,
                            summary: cal.summary,
                            accessToken: tokens.accessToken,
                            refreshToken: tokens.refreshToken,
                        }),
                    );
                }
                return { count: imported.length, calendars: imported };
            }

            if (!data?.calendarId || !data?.userId) {
                return {
                    success: false,
                    error: "calendarId and userId are required",
                    eventsSynced: 0,
                };
            }

            const existing = await prisma.calendar.findFirst({
                where: {
                    userId: data.userId,
                    type: "google",
                    config: {
                        path: ["calendarId"],
                        equals: data.calendarId,
                    },
                },
                select: { id: true },
            });

            const calendarId =
                existing?.id ??
                (
                    await calendarService.createCalendar({
                        userId: data.userId,
                        name: data.summary || "Google Calendar",
                        type: "google",
                        config: {
                            accessToken: data.accessToken,
                            refreshToken: data.refreshToken,
                            calendarId: data.calendarId,
                        },
                    })
                ).id;

            return this.sync(calendarId);
        } catch (error: any) {
            return { error: error?.message ?? "import-failed" };
        }
    }
}
