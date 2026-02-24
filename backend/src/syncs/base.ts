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

/**
 * Fully abstract base class for calendar synchronization.
 * All methods must be implemented by subclasses.
 */
export abstract class CalendarSync<TConfig = any> {
    /** Returns a unique type identifier for this calendar provider */
    abstract getType(): string;

    /** Validates the calendar configuration */
    protected abstract validateConfig(config: TConfig): boolean;

    /** Fetches events from the calendar */
    protected abstract fetchEvents(
        calendar: CalendarWithUser,
    ): Promise<ParsedEvent[]>;

    /** Syncs the calendar and returns a summary of the result */
    protected abstract syncCalendar(
        calendar: CalendarWithUser,
    ): Promise<SyncResult>;

    /** Tests the calendar connection */
    protected abstract testConnection(config: TConfig): Promise<{
        success: boolean;
        eventsPreview?: string[];
        error?: string;
    }>;
}
