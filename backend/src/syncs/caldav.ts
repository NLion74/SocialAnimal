import { createDAVClient } from "tsdav";
import type { DAVCalendar, DAVCalendarObject } from "tsdav";
import { ICalendarBaseSync } from "./ical-base";
import type { ParsedEvent } from "./ical-base";
import type { CalendarWithUser } from "../types";

export interface CaldavConfig {
    url: string;
    username?: string;
    password?: string;
    calendarPath?: string;
}

export interface DiscoveredCalendar {
    url: string;
    displayName: string;
    color?: string;
}

const FETCH_YEARS_BACK = 1;
const FETCH_YEARS_AHEAD = 2;

function buildTimeRange() {
    const start = new Date();
    start.setFullYear(start.getFullYear() - FETCH_YEARS_BACK);
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setFullYear(end.getFullYear() + FETCH_YEARS_AHEAD);
    end.setHours(23, 59, 59, 999);

    return { start: start.toISOString(), end: end.toISOString() };
}

function extractServerRoot(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}`;
    } catch {
        return url;
    }
}

function isDeepCalendarPath(url: string): boolean {
    try {
        const pathname = new URL(url).pathname;
        return pathname.length > 1 && pathname !== "/";
    } catch {
        return false;
    }
}

export class CaldavSync extends ICalendarBaseSync<CaldavConfig> {
    getType(): string {
        return "caldav";
    }

    protected validateConfig(config: CaldavConfig): boolean {
        return !!config?.url;
    }

    protected createClient(config: CaldavConfig): Promise<any> {
        return createDAVClient({
            serverUrl: extractServerRoot(config.url),
            credentials: {
                username: config.username || "",
                password: config.password || "",
            },
            authMethod: "Basic",
            defaultAccountType: "caldav",
        });
    }

    public async discoverCalendars(
        config: CaldavConfig,
    ): Promise<DiscoveredCalendar[]> {
        try {
            const client = await this.createClient(
                config.url ? config : { ...config, url: "https://placeholder" },
            );
            const calendars = await client.fetchCalendars();
            return calendars.map((c: DAVCalendar) => ({
                url: c.url,
                displayName: (c as any).displayName ?? c.url,
                color: (c as any).calendarColor ?? undefined,
            }));
        } catch (e) {
            console.warn("CalDAV discovery failed:", e);
            return [];
        }
    }

    protected async fetchEvents(
        calendar: CalendarWithUser,
    ): Promise<ParsedEvent[]> {
        const rawConfig = calendar.config as unknown as CaldavConfig | null;
        const config: CaldavConfig = {
            url: (rawConfig?.url as string) || "",
            username: (rawConfig?.username as string) || "",
            password: (rawConfig?.password as string) || "",
            calendarPath: rawConfig?.calendarPath,
        };

        if (!this.validateConfig(config)) return [];

        const client = await this.createClient(config);
        const timeRange = buildTimeRange();

        const target = await this.resolveTargetCalendar(client, config);
        if (!target) return [];

        try {
            const objects = await client.fetchCalendarObjects({
                calendar: target,
                timeRange,
            });

            const events: ParsedEvent[] = [];
            for (const obj of objects as DAVCalendarObject[]) {
                if (obj.data) events.push(...this.parseICalData(obj.data));
            }
            return events;
        } catch (e) {
            console.warn(
                "Failed to fetch calendar objects from",
                target.url,
                e,
            );
            return [];
        }
    }

    private async resolveTargetCalendar(
        client: any,
        config: CaldavConfig,
    ): Promise<DAVCalendar | null> {
        const calendarPath = config.calendarPath;

        if (calendarPath && isDeepCalendarPath(calendarPath)) {
            return { url: calendarPath } as DAVCalendar;
        }

        const targetUrl = calendarPath || config.url;

        try {
            const discovered: DAVCalendar[] = await client.fetchCalendars();

            if (discovered.length === 0) {
                return { url: targetUrl } as DAVCalendar;
            }

            const normalize = (u: string) => u.replace(/\/$/, "").toLowerCase();

            const exact = discovered.find(
                (c) => normalize(c.url) === normalize(targetUrl),
            );
            if (exact) return exact;

            const partial = discovered.find(
                (c) =>
                    normalize(c.url).includes(normalize(targetUrl)) ||
                    normalize(targetUrl).includes(normalize(c.url)),
            );
            if (partial) return partial;

            if (discovered.length === 1) return discovered[0];

            console.warn(
                `Multiple calendars discovered but no match for ${targetUrl} — using first`,
            );
            return discovered[0];
        } catch {
            return { url: targetUrl } as DAVCalendar;
        }
    }

    protected async testConnection(config: CaldavConfig): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        if (!this.validateConfig(config)) {
            return { success: false, error: "Missing required field: url" };
        }

        try {
            const events = await this.fetchEvents({ config } as any);
            return {
                success: true,
                eventsPreview: events.slice(0, 5).map((e) => e.summary),
            };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to connect",
            };
        }
    }

    public async testCalendar(calendar: {
        type: string;
        config: CaldavConfig;
    }): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        if (calendar.type !== "caldav")
            return { success: false, error: "Unsupported type" };
        return this.testConnection(calendar.config);
    }
}

export const caldavSync = new CaldavSync();
