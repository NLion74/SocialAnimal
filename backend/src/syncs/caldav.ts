import { createDAVClient } from "tsdav";
import type { DAVCalendar, DAVCalendarObject } from "tsdav";
import { ICalendarBaseSync } from "./ical-base";
import type { ParsedEvent } from "./ical-base";
import type { CalendarWithUser } from "../types";

export interface CaldavConfig {
    url: string;
    username: string;
    password: string;
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

export class CaldavSync extends ICalendarBaseSync<CaldavConfig> {
    getType(): string {
        return "caldav";
    }

    protected validateConfig(config: CaldavConfig): boolean {
        return !!(config?.url && config?.username && config?.password);
    }

    protected createClient(config: CaldavConfig): Promise<any> {
        return createDAVClient({
            serverUrl: config.url,
            credentials: {
                username: config.username,
                password: config.password,
            },
            authMethod: "Basic",
            defaultAccountType: "caldav",
        });
    }

    public async discoverCalendars(
        config: CaldavConfig,
    ): Promise<DiscoveredCalendar[]> {
        if (!this.validateConfig(config)) return [];

        const client = await this.createClient(config);
        const calendars = await client.fetchCalendars();

        return calendars.map((c: DAVCalendar) => ({
            url: c.url,
            displayName: (c as any).displayName ?? c.url,
            color: (c as any).calendarColor ?? undefined,
        }));
    }

    protected async fetchEvents(
        calendar: CalendarWithUser,
    ): Promise<ParsedEvent[]> {
        const rawConfig = calendar.config as unknown as CaldavConfig | null;
        const config: CaldavConfig = {
            url: (rawConfig?.url as string) || "",
            username: (rawConfig?.username as string) || "",
            password: (rawConfig?.password as string) || "",
        };

        if (!this.validateConfig(config)) return [];

        const client = await this.createClient(config);

        let allCalendars = await client.fetchCalendars();

        // FALLBACK: If no calendars found, assume config.url is DIRECT calendar URL
        if (!allCalendars.length) {
            console.log(
                "Discovery failed, trying direct calendar:",
                config.url,
            );
            const directCal = {
                url: config.url,
                displayName: "Direct Calendar",
            } as DAVCalendar;
            allCalendars = [directCal];
        }

        if (!allCalendars.length) return [];

        const timeRange = buildTimeRange();
        const events: ParsedEvent[] = [];

        for (const target of allCalendars) {
            try {
                const objects = await client.fetchCalendarObjects({
                    calendar: target,
                    timeRange,
                });
                for (const obj of objects as DAVCalendarObject[]) {
                    if (obj.data) {
                        events.push(...this.parseICalData(obj.data));
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch from", target.url, e);
            }
        }

        return events;
    }

    protected async testConnection(config: CaldavConfig): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        if (!this.validateConfig(config)) {
            return {
                success: false,
                error: "Missing required fields: url, username, password",
            };
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
