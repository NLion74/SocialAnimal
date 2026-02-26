import type { SyncResult, CalendarWithUser } from "../types";

export interface ParsedEvent {
    externalId: string;
    summary: string;
    description?: string | null;
    location?: string | null;
    startTime: Date;
    endTime: Date;
    allDay: boolean;
}

export abstract class CalendarSync<TConfig = any> {
    abstract getType(): string;

    protected abstract validateConfig(_config: TConfig): boolean;

    protected abstract fetchEvents(
        _calendar: CalendarWithUser,
    ): Promise<ParsedEvent[]>;

    protected abstract syncCalendar(
        _calendar: CalendarWithUser,
    ): Promise<SyncResult>;

    protected abstract testConnection(_config: TConfig): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }>;
}
