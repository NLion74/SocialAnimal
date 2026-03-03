import {
    maskExportEventFields,
    ProviderHandler,
    resolveShareExportAccess,
} from "./base";
import type { CalendarWithUser, SyncResult } from "../types";
import { prisma } from "../utils/db";
import { env } from "../utils/env";
import * as calendarService from "../services/calendarService";
import ical from "node-ical";

export interface IcsConfig {
    url: string;
    username?: string;
    password?: string;
}

type VEvent = any;

class IcsCalendarSync {
    getType(): string {
        return "ics";
    }

    private getConfig(config: any): IcsConfig {
        if (!this.validateConfig(config)) {
            throw new Error("Invalid ICS config");
        }
        return config as IcsConfig;
    }

    protected validateConfig(config: any): boolean {
        if (!config || typeof config !== "object") return false;
        return typeof config.url === "string";
    }

    protected async fetchEvents(calendar: CalendarWithUser): Promise<any[]> {
        const config = this.getConfig(calendar.config);
        const icsText = await this.fetchIcs(config);
        const events = this.extractEvents(ical.parseICS(icsText));
        return events.map((e: VEvent) => ({
            externalId: e.uid || `${calendar.id}-${e.start.toISOString()}`,
            summary: e.summary || "Untitled",
            description: e.description || null,
            location: e.location || null,
            startTime: e.start,
            endTime: e.end,
            allDay: e.datetype === "date",
        }));
    }

    public async syncCalendar(calendar: CalendarWithUser): Promise<SyncResult> {
        let events: any[];
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
        const externalIds = events.map((e) => e.externalId);
        let createdCount = 0;
        try {
            await prisma.$transaction(async (tx: any) => {
                const result = await tx.event.createMany({
                    data: events.map((e) => ({
                        calendarId: calendar.id,
                        externalId: e.externalId,
                        title: e.summary,
                        description: e.description,
                        location: e.location,
                        startTime: e.startTime,
                        endTime: e.endTime,
                        allDay: e.allDay,
                    })),
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
            console.error(`[ics:sync:error] ${calendar.id}:`, error);
            return {
                success: false,
                error: "Database error during sync",
                eventsSynced: 0,
            };
        }
    }

    public async testCalendar(calendar: {
        type: string;
        config: IcsConfig;
    }): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        if (calendar.type !== "ics") {
            return { success: false, error: "Unsupported type" };
        }
        if (!this.validateConfig(calendar.config)) {
            return { success: false, error: "Invalid ICS config" };
        }
        return this.testConnection(calendar.config);
    }

    protected async testConnection(
        config: IcsConfig,
    ): Promise<{ success: boolean; eventsPreview?: string[]; error?: string }> {
        try {
            const text = await this.fetchIcs(config);
            const events = this.extractEvents(ical.parseICS(text));
            if (!events.length) {
                return { success: false, error: "No events found" };
            }
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
                error: err?.message ?? "Failed to fetch ICS",
            };
        }
    }

    private normalizeUrl(raw: string): string {
        if (raw.startsWith("webcal://")) return "https://" + raw.slice(9);
        if (!raw.includes("://")) return "https://" + raw;
        return raw;
    }

    private extractEvents(raw: Record<string, VEvent>): VEvent[] {
        return Object.values(raw).filter(
            (e: any) => e?.type === "VEVENT" && e.start && e.end,
        );
    }

    private async fetchIcs(
        config: IcsConfig,
        timeoutMs = 15000,
    ): Promise<string> {
        if (!config?.url) throw new Error("No ICS URL provided");
        const normalized = this.normalizeUrl(config.url);
        const isLocalhost =
            normalized.includes("localhost") ||
            normalized.includes("127.0.0.1");
        const urls: string[] = isLocalhost
            ? ["http://" + normalized.replace(/^https?:\/\//, "")]
            : normalized.startsWith("http://")
              ? [normalized.replace("http://", "https://"), normalized]
              : normalized.startsWith("https://")
                ? [normalized, normalized.replace("https://", "http://")]
                : ["https://" + normalized, "http://" + normalized];
        const headers: Record<string, string> = {};
        if (config.username && config.password) {
            headers["Authorization"] =
                `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
        }
        let lastError: string | null = null;
        for (const url of urls) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), timeoutMs);
                const res = await fetch(url, {
                    headers,
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (res.status === 401)
                    throw new Error("Unauthorized: wrong username/password");
                if (!res.ok) {
                    lastError = `HTTP error ${res.status}`;
                    continue;
                }
                const text = await res.text();
                if (!text.includes("BEGIN:VCALENDAR")) {
                    lastError = "Invalid ICS data";
                    continue;
                }
                const events = this.extractEvents(ical.parseICS(text));
                if (!events || events.length === 0) {
                    lastError = "No events found";
                    continue;
                }
                return text;
            } catch (err: any) {
                lastError = err?.message ?? String(err);
            }
        }
        throw new Error(lastError || "Failed to fetch ICS");
    }
}

const icsSync = new IcsCalendarSync();

export class IcsHandler implements ProviderHandler {
    async sync(calendarId: string, userId?: string): Promise<SyncResult> {
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
        return await icsSync.syncCalendar(calendar as CalendarWithUser);
    }

    async test(credentials: any): Promise<any> {
        return await icsSync.testCalendar({ type: "ics", config: credentials });
    }

    async import(data: any): Promise<SyncResult> {
        if (data?.calendarId) {
            return this.sync(data.calendarId, data.userId);
        }

        if (!data?.userId || !data?.name || !(data?.url || data?.config?.url)) {
            return {
                success: false,
                error: "userId, name, and url/config.url are required",
                eventsSynced: 0,
            };
        }

        const calendar = await calendarService.createCalendar({
            userId: data.userId,
            name: data.name,
            type: "ics",
            url: data.url,
            config: data.config,
        });

        return this.sync(calendar.id, data.userId);
    }

    async export(data: {
        calendarId: string;
        permission?: string;
        subscription?: boolean;
        token?: string;
        userId?: string;
        type?: string;
    }): Promise<any> {
        if (data?.type === "link") {
            if (!data?.calendarId) {
                return { error: "calendarId is required for link export" };
            }
            if (!data?.userId || !data?.token) {
                return {
                    error: "Provider not found or export not supported",
                };
            }

            const access = await resolveShareExportAccess(
                data.calendarId,
                data.token,
            );
            if (!access.allowed || access.userId !== data.userId) {
                return { error: "Provider not found or export not supported" };
            }

            const token = encodeURIComponent(data.token);
            return {
                url: `${env.publicUrl}/api/providers/ics/export/${data.calendarId}?token=${token}`,
            };
        }

        if (!data?.calendarId) {
            return { error: "Provider not found or export not supported" };
        }

        if (!data?.subscription || !data?.token) {
            return { error: "Provider not found or export not supported" };
        }

        const access = await resolveShareExportAccess(
            data.calendarId,
            data.token,
        );
        if (!access.allowed) {
            return { error: "Provider not found or export not supported" };
        }

        const events = await prisma.event.findMany({
            where: { calendarId: data.calendarId },
            orderBy: { startTime: "asc" },
        });

        const body = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//SocialAnimal//ICS Export//EN",
            ...events.flatMap((rawEvent: any) => {
                const event = maskExportEventFields(
                    rawEvent,
                    access.permission,
                );

                return [
                    "BEGIN:VEVENT",
                    `UID:${event.externalId || event.id}`,
                    `SUMMARY:${event.title.replace(/\n/g, " ")}`,
                    `DTSTART:${new Date(event.startTime)
                        .toISOString()
                        .replace(/[-:]/g, "")
                        .replace(/\.\d{3}Z$/, "Z")}`,
                    `DTEND:${new Date(event.endTime)
                        .toISOString()
                        .replace(/[-:]/g, "")
                        .replace(/\.\d{3}Z$/, "Z")}`,
                    event.description
                        ? `DESCRIPTION:${String(event.description).replace(/\n/g, " ")}`
                        : "",
                    event.location
                        ? `LOCATION:${String(event.location).replace(/\n/g, " ")}`
                        : "",
                    "END:VEVENT",
                ];
            }),
            "END:VCALENDAR",
        ]
            .filter(Boolean)
            .join("\r\n");

        return {
            body,
            mimeType: "text/calendar",
            fileExtension: "ics",
        };
    }
}
