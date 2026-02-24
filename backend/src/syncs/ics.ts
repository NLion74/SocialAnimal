import ical from "node-ical";
import { CalendarSync, ParsedEvent } from "./base";
import type { CalendarWithUser } from "../types";

export interface IcsConfig {
    url: string;
    username?: string;
    password?: string;
}

type VEvent = any;

class IcsCalendarSync extends CalendarSync {
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

    protected async fetchEvents(
        calendar: CalendarWithUser,
    ): Promise<ParsedEvent[]> {
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

    protected async testConnection(config: IcsConfig): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }> {
        try {
            const text = await this.fetchIcs(config);
            const events = this.extractEvents(ical.parseICS(text));

            if (!events.length) {
                return {
                    success: false,
                    error: "No events found",
                };
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
            headers["Authorization"] = `Basic ${Buffer.from(
                `${config.username}:${config.password}`,
            ).toString("base64")}`;
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

export const icsSync = new IcsCalendarSync();
