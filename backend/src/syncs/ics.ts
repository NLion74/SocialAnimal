import { ICalendarBaseSync } from "./ical-base";
import type { ParsedEvent } from "./ical-base";
import type { CalendarWithUser } from "../types";

export interface IcsConfig {
    url: string;
    username?: string;
    password?: string;
}

class IcsSync extends ICalendarBaseSync<IcsConfig> {
    getType(): string {
        return "ics";
    }

    protected validateConfig(config: IcsConfig): boolean {
        return !!(config?.url && typeof config.url === "string");
    }

    protected async fetchEvents(
        calendar: CalendarWithUser,
    ): Promise<ParsedEvent[]> {
        const config = calendar.config as unknown as IcsConfig;

        if (!this.validateConfig(config)) return [];

        const headers: Record<string, string> = {};
        if (config.username && config.password) {
            const credentials = Buffer.from(
                `${config.username}:${config.password}`,
            ).toString("base64");
            headers["Authorization"] = `Basic ${credentials}`;
        }

        const res = await fetch(config.url, { headers });

        if (!res.ok) throw new Error(`Failed to fetch ICS: ${res.status}`);

        return this.parseICalData(await res.text());
    }

    protected async testConnection(config: IcsConfig): Promise<{
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
        config: IcsConfig;
    }): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        if (calendar.type !== "ics")
            return { success: false, error: "Unsupported type" };
        return this.testConnection(calendar.config);
    }
}

export const icsSync = new IcsSync();
