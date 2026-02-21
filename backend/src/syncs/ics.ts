import ical from "node-ical";
import type { CalendarWithUser, SyncResult, TestResult } from "../types";
import { prisma } from "../utils/db";
import type { PrismaClient } from "@prisma/client";

interface ParsedEvent {
    externalId: string;
    summary: string;
    description?: string | null;
    location?: string | null;
    startTime: Date;
    endTime: Date;
    allDay: boolean;
}

type VEvent = any;

export interface IcsConfig {
    url: string;
    username?: string;
    password?: string;
}

function normalizeUrlCandidate(raw: string): string {
    if (raw.startsWith("webcal://")) return "https://" + raw.slice(9);
    if (!raw.includes("://")) return "https://" + raw;
    return raw;
}

function extractEvents(raw: Record<string, VEvent>): VEvent[] {
    return Object.values(raw).filter(
        (e: any) => e?.type === "VEVENT" && e.start && e.end,
    );
}

export async function fetchIcs(
    config: IcsConfig,
    timeoutMs = 15000,
): Promise<string> {
    if (!config?.url) throw new Error("No ICS URL provided");

    const normalized = normalizeUrlCandidate(config.url);

    // Determine if localhost: skip HTTPS for localhost
    const isLocalhost =
        normalized.includes("localhost") || normalized.includes("127.0.0.1");

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

            const events = Object.values(ical.parseICS(text)).filter(
                (e: any) => e?.type === "VEVENT" && e.start && e.end,
            );

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

function getIcsConfig(config: unknown): IcsConfig | null {
    if (!config || typeof config !== "object") return null;
    const c = config as any;
    if (typeof c.url !== "string") return null;

    return {
        url: c.url,
        username: typeof c.username === "string" ? c.username : undefined,
        password: typeof c.password === "string" ? c.password : undefined,
    };
}

export async function syncIcsCalendar(
    calendar: CalendarWithUser,
): Promise<SyncResult> {
    const calendarConfig = getIcsConfig(calendar.config);
    if (!calendarConfig) {
        await prisma.calendar.update({
            where: { id: calendar.id },
            data: { lastSync: new Date() },
        });
        return {
            success: false,
            error: "No ICS URL in config",
            eventsSynced: 0,
        };
    }

    let icsText: string;
    try {
        icsText = await fetchIcs(calendarConfig);
    } catch (err: any) {
        return {
            success: false,
            error: err?.message ?? "Failed to fetch ICS",
            eventsSynced: 0,
        };
    }

    const events = extractEvents(ical.parseICS(icsText));
    if (!events.length) {
        await prisma.calendar.update({
            where: { id: calendar.id },
            data: { lastSync: new Date() },
        });
        return { success: false, error: "No events found", eventsSynced: 0 };
    }

    const parsedEvents: ParsedEvent[] = events.map((e: VEvent) => ({
        externalId: e.uid || `${calendar.id}-${e.start.toISOString()}`,
        summary: e.summary || "Untitled",
        description: e.description || null,
        location: e.location || null,
        startTime: e.start,
        endTime: e.end,
        allDay: e.datetype === "date",
    }));

    const uids = parsedEvents.map((e) => e.externalId);
    let createdCount = 0;

    try {
        await prisma.$transaction(async (tx: PrismaClient) => {
            const result = await tx.event.createMany({
                data: parsedEvents.map((ev) => ({
                    calendarId: calendar.id,
                    externalId: ev.externalId,
                    title: ev.summary,
                    description: ev.description,
                    location: ev.location,
                    startTime: ev.startTime,
                    endTime: ev.endTime,
                    allDay: ev.allDay,
                })),
                skipDuplicates: true,
            });
            createdCount = result.count;

            await tx.event.deleteMany({
                where: { calendarId: calendar.id, externalId: { notIn: uids } },
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

export async function testIcsConnection(calendar: {
    type: string;
    config: { url: string; username?: string; password?: string };
}): Promise<TestResult> {
    if (calendar.type !== "ics")
        return { success: false, canConnect: false, error: "Unsupported type" };

    const calendarConfig = getIcsConfig(calendar.config);
    if (!calendarConfig)
        return { success: false, canConnect: false, error: "No URL in config" };

    try {
        const text = await fetchIcs(calendarConfig);
        const events = Object.values(ical.parseICS(text)).filter(
            (e: any) => e?.type === "VEVENT" && e.start && e.end,
        );

        if (!events.length)
            return {
                success: false,
                canConnect: false,
                error: "No events found",
            };

        return {
            success: true,
            canConnect: true,
            eventsPreview: events.slice(0, 5).map((e) => e.summary),
        };
    } catch (err: any) {
        return {
            success: false,
            canConnect: false,
            error: err?.message ?? "Failed to fetch ICS",
        };
    }
}
