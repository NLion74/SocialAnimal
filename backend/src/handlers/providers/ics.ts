import {
    maskExportEventFields,
    ProviderHandler,
    resolveShareExportAccess,
} from "./base";
import type { CalendarWithUser, SyncResult } from "../../types";
import { prisma } from "../../utils/db";
import { env } from "../../utils/env";
import * as calendarService from "../../services/calendarService";
import ical from "node-ical";

export interface IcsConfig {
    url: string;
    username?: string;
    password?: string;
}

type VEvent = any;

type FloatingHint = {
    raw: string;
    floating: boolean;
};

type FloatingHints = {
    byUid: Record<string, { start?: FloatingHint; end?: FloatingHint }>;
    calendarTimeZone?: string;
};

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
        const userTimezone = (calendar as any)?.user?.settings?.timezone;
        const icsText = await this.fetchIcs(config);
        const hints = this.extractFloatingHints(icsText);
        const events = this.extractEvents(ical.parseICS(icsText));
        return events.map((e: VEvent) => ({
            externalId: e.uid || `${calendar.id}-${e.start.toISOString()}`,
            summary: e.summary || "Untitled",
            description: e.description || null,
            location: e.location || null,
            startTime: this.resolveDate(
                e.start,
                e.datetype === "date",
                e.uid,
                "start",
                hints,
                userTimezone,
            ),
            endTime: this.resolveDate(
                e.end,
                e.datetype === "date",
                e.uid,
                "end",
                hints,
                userTimezone,
            ),
            allDay: e.datetype === "date",
        }));
    }

    private resolveDate(
        value: Date,
        isAllDay: boolean,
        uid: string | undefined,
        field: "start" | "end",
        hints: FloatingHints,
        userTimezone?: string,
    ): Date {
        if (isAllDay) return new Date(value);

        const withTz = value as Date & { tz?: string; dateOnly?: true };
        if (withTz.tz || withTz.dateOnly) {
            return new Date(value);
        }

        const hint = uid ? hints.byUid[uid]?.[field] : undefined;
        if (!hint?.floating) {
            return new Date(value);
        }

        const tz = hints.calendarTimeZone || userTimezone;
        if (!tz) {
            return new Date(value);
        }

        return this.floatingToUtc(hint.raw, tz);
    }

    private extractFloatingHints(icsText: string): FloatingHints {
        const lines = icsText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        const byUid: FloatingHints["byUid"] = {};
        const calendarTimeZone = this.extractCalendarTimeZone(lines);

        let inEvent = false;
        let uid: string | undefined;
        let start: FloatingHint | undefined;
        let end: FloatingHint | undefined;

        const flush = () => {
            if (!uid) return;
            byUid[uid] = {
                ...(start ? { start } : {}),
                ...(end ? { end } : {}),
            };
        };

        for (const line of lines) {
            if (line === "BEGIN:VEVENT") {
                inEvent = true;
                uid = undefined;
                start = undefined;
                end = undefined;
                continue;
            }
            if (line === "END:VEVENT") {
                flush();
                inEvent = false;
                uid = undefined;
                start = undefined;
                end = undefined;
                continue;
            }
            if (!inEvent) continue;

            if (line.startsWith("UID:")) {
                uid = line.slice(4).trim();
                continue;
            }

            const parseField = (prefix: string): FloatingHint | undefined => {
                if (!line.startsWith(prefix)) return undefined;
                const colon = line.indexOf(":");
                if (colon < 0) return undefined;
                const left = line.slice(0, colon);
                const raw = line.slice(colon + 1).trim();
                const isDateOnly = /(?:^|;)VALUE=DATE(?:;|$)/.test(left);
                const hasTzid = /(?:^|;)TZID=/.test(left);
                const hasZoneSuffix = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
                const floating =
                    !isDateOnly &&
                    !hasTzid &&
                    !hasZoneSuffix &&
                    /^\d{8}T\d{6}$/.test(raw);
                return { raw, floating };
            };

            start = start ?? parseField("DTSTART");
            end = end ?? parseField("DTEND");
        }

        return { byUid, ...(calendarTimeZone ? { calendarTimeZone } : {}) };
    }

    private extractCalendarTimeZone(lines: string[]): string | undefined {
        for (const line of lines) {
            if (line.startsWith("X-WR-TIMEZONE:")) {
                const tz = line.slice("X-WR-TIMEZONE:".length).trim();
                if (tz) return tz;
            }
            if (line.startsWith("TIMEZONE-ID:")) {
                const tz = line.slice("TIMEZONE-ID:".length).trim();
                if (tz) return tz;
            }
        }

        let inVTimeZone = false;
        for (const line of lines) {
            if (line === "BEGIN:VTIMEZONE") {
                inVTimeZone = true;
                continue;
            }
            if (line === "END:VTIMEZONE") {
                inVTimeZone = false;
                continue;
            }
            if (inVTimeZone && line.startsWith("TZID:")) {
                const tz = line.slice("TZID:".length).trim();
                if (tz) return tz;
            }
        }

        return undefined;
    }

    private floatingToUtc(raw: string, timeZone: string): Date {
        const y = Number(raw.slice(0, 4));
        const m = Number(raw.slice(4, 6)) - 1;
        const d = Number(raw.slice(6, 8));
        const h = Number(raw.slice(9, 11));
        const min = Number(raw.slice(11, 13));
        const sec = Number(raw.slice(13, 15));

        let utcTs = Date.UTC(y, m, d, h, min, sec);
        for (let i = 0; i < 2; i++) {
            const offset = this.timeZoneOffsetMs(new Date(utcTs), timeZone);
            const adjusted = Date.UTC(y, m, d, h, min, sec) - offset;
            if (adjusted === utcTs) break;
            utcTs = adjusted;
        }

        return new Date(utcTs);
    }

    private timeZoneOffsetMs(value: Date, timeZone: string): number {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }).formatToParts(value);

        const map: Record<string, string> = {};
        for (const part of parts) {
            if (part.type !== "literal") map[part.type] = part.value;
        }

        const asUtc = Date.UTC(
            Number(map.year),
            Number(map.month) - 1,
            Number(map.day),
            Number(map.hour),
            Number(map.minute),
            Number(map.second),
        );

        return asUtc - value.getTime();
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
        let syncedCount = 0;
        try {
            await prisma.$transaction(async (tx: any) => {
                for (const e of events) {
                    await tx.event.upsert({
                        where: {
                            calendarId_externalId: {
                                calendarId: calendar.id,
                                externalId: e.externalId,
                            },
                        },
                        create: {
                            calendarId: calendar.id,
                            externalId: e.externalId,
                            title: e.summary,
                            description: e.description,
                            location: e.location,
                            startTime: e.startTime,
                            endTime: e.endTime,
                            allDay: e.allDay,
                        },
                        update: {
                            title: e.summary,
                            description: e.description,
                            location: e.location,
                            startTime: e.startTime,
                            endTime: e.endTime,
                            allDay: e.allDay,
                        },
                    });
                    syncedCount += 1;
                }
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
            return { success: true, eventsSynced: syncedCount };
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
    async sync(calendarId: string): Promise<SyncResult> {
        const calendar = await prisma.calendar.findUnique({
            where: { id: calendarId },
            include: {
                user: {
                    select: {
                        email: true,
                        settings: { select: { timezone: true } },
                    },
                },
            },
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
            return this.sync(data.calendarId);
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

        return this.sync(calendar.id);
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
