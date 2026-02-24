import type { SyncResult, TestResult, CalendarWithUser } from "../types";
import { prisma } from "../utils/db";

export interface ParsedEvent {
    externalId: string;
    summary: string;
    description?: string | null;
    location?: string | null;
    startTime: Date;
    endTime: Date;
    allDay: boolean;
}

export abstract class CalendarSync {
    abstract getType(): string;

    protected abstract validateConfig(config: unknown): boolean;

    protected abstract fetchEvents(
        calendar: CalendarWithUser,
    ): Promise<ParsedEvent[]>;

    protected abstract testConnection(
        config: any,
    ): Promise<{ success: boolean; eventsPreview?: string[]; error?: string }>;

    async syncCalendar(calendar: CalendarWithUser): Promise<SyncResult> {
        if (!this.validateConfig(calendar.config)) {
            await this.updateLastSync(calendar.id);
            return {
                success: false,
                error: "Invalid calendar configuration",
                eventsSynced: 0,
            };
        }

        let events: ParsedEvent[];
        try {
            events = await this.fetchEvents(calendar);
        } catch (err: any) {
            return {
                success: false,
                error: err?.message ?? "Failed to fetch events",
                eventsSynced: 0,
            };
        }

        if (!events.length) {
            await this.updateLastSync(calendar.id);
            return {
                success: true,
                eventsSynced: 0,
            };
        }

        return await this.saveEvents(calendar.id, events);
    }

    async testCalendar(calendar: {
        type: string;
        config: any;
    }): Promise<TestResult> {
        if (calendar.type !== this.getType()) {
            return {
                success: false,
                canConnect: false,
                error: "Unsupported type",
            };
        }

        if (!this.validateConfig(calendar.config)) {
            return {
                success: false,
                canConnect: false,
                error: "Invalid configuration",
            };
        }

        try {
            const result = await this.testConnection(calendar.config);
            return {
                success: result.success,
                canConnect: result.success,
                eventsPreview: result.eventsPreview,
                error: result.error,
            };
        } catch (err: any) {
            return {
                success: false,
                canConnect: false,
                error: err?.message ?? "Connection test failed",
            };
        }
    }

    private async saveEvents(
        calendarId: string,
        events: ParsedEvent[],
    ): Promise<SyncResult> {
        const uids = events.map((e) => e.externalId);
        let createdCount = 0;

        try {
            await prisma.$transaction(async (tx: any) => {
                const result = await tx.event.createMany({
                    data: events.map((e) => ({
                        calendarId,
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
                        calendarId,
                        externalId: { notIn: uids },
                    },
                });

                await tx.calendar.update({
                    where: { id: calendarId },
                    data: { lastSync: new Date() },
                });
            });

            return { success: true, eventsSynced: createdCount };
        } catch (err) {
            return {
                success: false,
                error: "Database error during sync",
                eventsSynced: 0,
            };
        }
    }

    private async updateLastSync(calendarId: string): Promise<void> {
        await prisma.calendar.update({
            where: { id: calendarId },
            data: { lastSync: new Date() },
        });
    }
}
