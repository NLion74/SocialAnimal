import type { Calendar } from "@prisma/client";

export interface SyncResult {
    success: boolean;
    eventsSynced?: number;
    error?: string;
}

export interface TestResult {
    success: boolean;
    eventsPreview?: string[];
    totalEvents?: number;
    url?: string;
    error?: string;
    canConnect?: boolean;
}

export type CalendarWithUser = Calendar & {
    user: { email: string };
};
