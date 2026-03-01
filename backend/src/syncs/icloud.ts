import { CaldavSync } from "./caldav";
import type { CaldavConfig, DiscoveredCalendar } from "./caldav";
import type { CalendarWithUser } from "../types";
import type { ParsedEvent } from "./ical-base";

export interface ICloudConfig {
    username: string;
    password: string;
    calendarPath?: string;
}

const ICLOUD_CALDAV_URL = "https://caldav.icloud.com";

function toICloudCaldavConfig(config: ICloudConfig): CaldavConfig {
    return {
        url: ICLOUD_CALDAV_URL,
        username: config.username,
        password: config.password,
        calendarPath: config.calendarPath,
    };
}

class ICloudSync extends CaldavSync {
    getType(): string {
        return "icloud";
    }

    protected validateConfig(config: ICloudConfig): boolean {
        return !!(config?.username && config?.password);
    }

    public async discoverCalendars(
        config: ICloudConfig,
    ): Promise<DiscoveredCalendar[]> {
        if (!this.validateConfig(config)) return [];
        return super.discoverCalendars(toICloudCaldavConfig(config));
    }

    protected async fetchEvents(
        calendar: CalendarWithUser,
    ): Promise<ParsedEvent[]> {
        const config = calendar.config as unknown as ICloudConfig;
        if (!this.validateConfig(config)) return [];
        return super.fetchEvents({
            ...calendar,
            config: toICloudCaldavConfig(
                config,
            ) as unknown as typeof calendar.config,
        });
    }

    protected async testConnection(config: ICloudConfig): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        if (!this.validateConfig(config)) {
            return {
                success: false,
                error: "Missing required fields: username, password",
            };
        }
        return super.testConnection(toICloudCaldavConfig(config));
    }

    public async testCalendar(calendar: {
        type: string;
        config: ICloudConfig;
    }): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        if (calendar.type !== "icloud")
            return { success: false, error: "Unsupported type" };
        return this.testConnection(calendar.config);
    }
}

export const icloudSync = new ICloudSync();
