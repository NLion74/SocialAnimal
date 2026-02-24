import { CalendarSync, ParsedEvent } from "./base";
import type { CalendarWithUser } from "../types";
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
