import { ProviderHandler } from "./base";
import { prisma } from "../../utils/db";
import * as calendarService from "../../services/calendarService";
import { createDAVClient } from "tsdav";
import type { DAVCalendar, DAVCalendarObject } from "tsdav";
import ical from "node-ical";

const ICLOUD_CALDAV_URL = "https://caldav.icloud.com";

type IcloudConfig = {
    username?: string;
    password?: string;
    calendarPath?: string;
};

type CaldavLikeConfig = {
    url: string;
    username?: string;
    password?: string;
    calendarPath?: string;
};

type ParsedEvent = {
    externalId: string;
    summary: string;
    description: string | null;
    location: string | null;
    startTime: Date;
    endTime: Date;
    allDay: boolean;
};

function normalizeUrl(url: string): string {
    return url.replace(/\/$/, "").toLowerCase();
}

function buildTimeRange() {
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setFullYear(end.getFullYear() + 2);
    end.setHours(23, 59, 59, 999);

    return { start: start.toISOString(), end: end.toISOString() };
}

export class IcloudHandler implements ProviderHandler {
    private toCaldavConfig(config: IcloudConfig): CaldavLikeConfig {
        return {
            url: ICLOUD_CALDAV_URL,
            username: config.username || "",
            password: config.password || "",
            calendarPath: config.calendarPath,
        };
    }

    private validateConfig(config: any): config is IcloudConfig {
        return !!(config && config.username && config.password);
    }

    private async createClient(config: CaldavLikeConfig): Promise<any> {
        const parsed = new URL(config.url);
        return createDAVClient({
            serverUrl: `${parsed.protocol}//${parsed.host}`,
            credentials: {
                username: config.username || "",
                password: config.password || "",
            },
            authMethod: "Basic",
            defaultAccountType: "caldav",
        });
    }

    private parseICalData(icalData: string): ParsedEvent[] {
        const parsed = ical.parseICS(icalData);
        const events: ParsedEvent[] = [];

        for (const component of Object.values(parsed) as any[]) {
            if (!component || component.type !== "VEVENT") continue;
            if (!component.uid || !component.start || !component.end) continue;

            events.push({
                externalId: String(component.uid),
                summary: String(component.summary || "Untitled"),
                description: component.description
                    ? String(component.description)
                    : null,
                location: component.location
                    ? String(component.location)
                    : null,
                startTime: new Date(component.start),
                endTime: new Date(component.end),
                allDay: component.datetype === "date",
            });
        }

        return events;
    }

    private async resolveTargetCalendar(
        client: any,
        config: CaldavLikeConfig,
    ): Promise<DAVCalendar | null> {
        const targetUrl = config.calendarPath || config.url;
        const discovered: DAVCalendar[] = await client.fetchCalendars();

        if (!discovered.length) return { url: targetUrl } as DAVCalendar;

        const exact = discovered.find(
            (c: DAVCalendar) => normalizeUrl(c.url) === normalizeUrl(targetUrl),
        );
        if (exact) return exact;

        const partial = discovered.find(
            (c: DAVCalendar) =>
                normalizeUrl(c.url).includes(normalizeUrl(targetUrl)) ||
                normalizeUrl(targetUrl).includes(normalizeUrl(c.url)),
        );
        if (partial) return partial;

        return discovered[0] || null;
    }

    private async fetchEvents(config: IcloudConfig): Promise<ParsedEvent[]> {
        const caldavConfig = this.toCaldavConfig(config);
        const client = await this.createClient(caldavConfig);
        const target = await this.resolveTargetCalendar(client, caldavConfig);
        if (!target) return [];

        const objects = await client.fetchCalendarObjects({
            calendar: target,
            timeRange: buildTimeRange(),
        });

        const events: ParsedEvent[] = [];
        for (const obj of objects as DAVCalendarObject[]) {
            if (obj.data) {
                events.push(...this.parseICalData(obj.data));
            }
        }
        return events;
    }

    async discover(params?: any): Promise<any> {
        if (!this.validateConfig(params)) {
            return { calendars: [] };
        }

        try {
            const client = await this.createClient(this.toCaldavConfig(params));
            const calendars: DAVCalendar[] = await client.fetchCalendars();
            return {
                calendars: calendars.map((c: any) => ({
                    url: c.url,
                    displayName: c.displayName ?? c.url,
                    color: c.calendarColor ?? undefined,
                })),
            };
        } catch {
            return { calendars: [] };
        }
    }

    async test(credentials: any): Promise<any> {
        if (!this.validateConfig(credentials)) {
            return {
                success: false,
                error: "Missing required fields: username/password",
            };
        }

        try {
            const events = await this.fetchEvents(credentials);
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

    async sync(calendarId: string): Promise<any> {
        const calendar = await prisma.calendar.findUnique({
            where: { id: calendarId },
        });

        if (!calendar) {
            return {
                success: false,
                error: "Calendar not found",
                eventsSynced: 0,
            };
        }

        const config = calendar.config as IcloudConfig;
        if (!this.validateConfig(config)) {
            return {
                success: false,
                error: "Invalid iCloud config",
                eventsSynced: 0,
            };
        }

        let events: ParsedEvent[];
        try {
            events = await this.fetchEvents(config);
        } catch (error: any) {
            await prisma.calendar.update({
                where: { id: calendar.id },
                data: { lastSync: new Date() },
            });
            return {
                success: false,
                error: error?.message ?? "Failed to fetch events",
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
        } catch {
            return {
                success: false,
                error: "Database error during sync",
                eventsSynced: 0,
            };
        }
    }

    async import(data: any): Promise<any> {
        if (data?.calendarId) {
            return this.sync(data.calendarId);
        }

        const credentials = data?.credentials || data;
        if (!this.validateConfig(credentials)) {
            return { error: "missing-credentials" };
        }

        const userId = data?.userId;
        if (!userId) {
            return { error: "missing-user-id" };
        }

        const calendars =
            Array.isArray(data?.calendars) && data.calendars.length
                ? data.calendars
                : data?.name
                  ? [{ name: data.name, url: data.calendarPath || "" }]
                  : [];

        if (!calendars.length) {
            return { error: "missing-calendars" };
        }

        const imported = [];
        for (const cal of calendars) {
            const calendar = await calendarService.createCalendar({
                userId,
                name: cal.name || cal.url || "iCloud Calendar",
                type: "icloud",
                config: {
                    username: credentials.username || "",
                    password: credentials.password || "",
                    calendarPath: cal.calendarPath || cal.url || undefined,
                },
            });

            const sync = await this.sync(calendar.id);
            imported.push({ calendar, sync });
        }

        return { count: imported.length, calendars: imported };
    }
}
