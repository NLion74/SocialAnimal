import type { FastifyReply } from "fastify";

export interface CalendarEvent {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    allDay: boolean;
    description: string | null;
    location: string | null;
    createdAt: Date;
}

export type ExportPermission = "busy" | "titles" | "full";

export interface ExportContext {
    calendarName: string;
    events: CalendarEvent[];
    permission: ExportPermission;
}

export abstract class SubscriptionExporter {
    abstract readonly id: string;
    abstract readonly label: string;
    abstract readonly mimeType: string;
    abstract readonly fileExtension: string;

    abstract serialize(ctx: ExportContext): string;

    mask(event: CalendarEvent, permission: ExportPermission): CalendarEvent {
        if (permission === "full") return event;
        if (permission === "titles")
            return { ...event, description: null, location: null };
        return { ...event, title: "Busy", description: null, location: null };
    }

    maskAll(
        events: CalendarEvent[],
        permission: ExportPermission,
    ): CalendarEvent[] {
        return events.map((e) => this.mask(e, permission));
    }

    sendReply(reply: FastifyReply, filename: string, body: string): void {
        reply.header("Content-Type", this.mimeType);
        reply.header(
            "Content-Disposition",
            `inline; filename="${filename}.${this.fileExtension}"`,
        );
        reply.send(body);
    }
}
