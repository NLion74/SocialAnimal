import ical from "node-ical";
import type { VEvent, ParameterValue } from "node-ical";
import { CalendarSync } from "./base";
import type { ParsedEvent } from "./base";
import type { CalendarWithUser, SyncResult } from "../types";
import { prisma } from "../utils/db";

export type { ParsedEvent };

function toStr(value: ParameterValue | null | undefined): string | null {
    if (!value) return null;
    if (typeof value === "string") return value;
    return value.val;
}

export abstract class ICalendarBaseSync<
    TConfig = any,
> extends CalendarSync<TConfig> {
    protected parseICalData(icalData: string): ParsedEvent[] {
        const parsed = ical.parseICS(icalData);
        const events: ParsedEvent[] = [];

        for (const component of Object.values(parsed)) {
            if (!component || component.type !== "VEVENT") continue;

            const event = component as VEvent;
            if (!event.uid || !event.start || !event.end) continue;

            events.push({
                externalId: event.uid,
                summary: toStr(event.summary) ?? "Untitled",
                description: toStr(event.description),
                location: toStr(event.location),
                startTime: new Date(event.start),
                endTime: new Date(event.end),
                allDay: event.datetype === "date",
            });
        }

        return events;
    }

    public async syncCalendar(calendar: CalendarWithUser): Promise<SyncResult> {
        let events: ParsedEvent[];

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
                        description: e.description ?? null,
                        location: e.location ?? null,
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
            console.error(
                `[${this.getType()}:sync:error] ${calendar.id}:`,
                error,
            );
            return {
                success: false,
                error: "Database error during sync",
                eventsSynced: 0,
            };
        }
    }
}
