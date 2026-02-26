import { CalendarSync, ParsedEvent } from "./base";
import type { CalendarWithUser, SyncResult } from "../types";
import { env } from "../utils/env";
import { prisma } from "../utils/db";

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

class GoogleCalendarSync extends CalendarSync {
    getType(): string {
        return "google";
    }

    private getConfig(config: any): GoogleConfig {
        if (!this.validateConfig(config)) {
            throw new Error("Invalid Google config");
        }
        return config as GoogleConfig;
    }

    protected validateConfig(config: any): boolean {
        if (!config || typeof config !== "object") return false;
        return (
            typeof config.accessToken === "string" &&
            typeof config.refreshToken === "string" &&
            typeof config.calendarId === "string"
        );
    }

    protected async fetchEvents(
        calendar: CalendarWithUser,
    ): Promise<ParsedEvent[]> {
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

    public async syncCalendar(calendar: CalendarWithUser): Promise<SyncResult> {
        let events: GoogleEvent[];
        try {
            const parsed = await this.fetchEvents(calendar);
            events = parsed.map((e) => ({
                id: e.externalId,
                summary: e.summary,
                description: e.description ?? undefined,
                location: e.location ?? undefined,
                start: {
                    dateTime: e.allDay ? undefined : e.startTime.toISOString(),
                    date: e.allDay
                        ? e.startTime.toISOString().split("T")[0]
                        : undefined,
                },
                end: {
                    dateTime: e.allDay ? undefined : e.endTime.toISOString(),
                    date: e.allDay
                        ? e.endTime.toISOString().split("T")[0]
                        : undefined,
                },
            }));
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

            return {
                success: true,
                eventsSynced: createdCount,
            };
        } catch (error) {
            console.error(`[google:sync:error] ${calendar.id}:`, error);
            return {
                success: false,
                error: "Database error during sync",
                eventsSynced: 0,
            };
        }
    }

    public async testCalendar(calendar: {
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

        return this.testConnection(calendar.config);
    }

    protected async testConnection(config: GoogleConfig): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        try {
            const events = await this.fetchGoogleEvents(
                config.accessToken,
                config.calendarId,
            );
            return {
                success: true,
                eventsPreview: events.slice(0, 5).map((e) => e.summary),
            };
        } catch (err: any) {
            return {
                success: false,
                error: err?.message ?? "Failed to connect",
            };
        }
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
        if (!data.access_token)
            throw new Error("No access token in refresh response");

        return data.access_token;
    }

    private async fetchGoogleEvents(
        accessToken: string,
        calendarId: string,
    ): Promise<ParsedEvent[]> {
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

        return allEvents.map((e) => ({
            externalId: e.id,
            summary: e.summary ?? "Untitled",
            description: e.description ?? null,
            location: e.location ?? null,
            startTime: new Date(e.start.dateTime ?? e.start.date!),
            endTime: new Date(e.end.dateTime ?? e.end.date!),
            allDay: !e.start.dateTime,
        }));
    }
}

export const googleSync = new GoogleCalendarSync();
