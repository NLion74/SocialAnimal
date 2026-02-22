import { describe, it, expect, beforeEach } from "vitest";
import { getCurrentUserId, computeLayouts } from "../../lib/utils";
import type { CalEvent } from "../../lib/types";

describe("Utils", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe("getCurrentUserId", () => {
        it("should return null when no token", () => {
            expect(getCurrentUserId()).toBeNull();
        });

        it("should extract userId from valid token", () => {
            const payload = { sub: "user-123" };
            const token = btoa(JSON.stringify(payload));
            localStorage.setItem("token", token);

            expect(getCurrentUserId()).toBe("user-123");
        });

        it("should return null for invalid token", () => {
            localStorage.setItem("token", "invalid-token");
            expect(getCurrentUserId()).toBeNull();
        });

        it("should return null for malformed JSON", () => {
            const token = btoa("{invalid json");
            localStorage.setItem("token", token);
            expect(getCurrentUserId()).toBeNull();
        });
    });

    describe("computeLayouts", () => {
        it("should handle single event", () => {
            const events: CalEvent[] = [
                {
                    id: "1",
                    title: "Meeting",
                    startTime: "2026-02-22T10:00:00Z",
                    endTime: "2026-02-22T11:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
            ];

            const layouts = computeLayouts(events);

            expect(layouts).toHaveLength(1);
            expect(layouts[0].col).toBe(0);
            expect(layouts[0].cols).toBe(1);
            expect(layouts[0].event.id).toBe("1");
        });

        it("should handle non-overlapping events in one column", () => {
            const events: CalEvent[] = [
                {
                    id: "1",
                    title: "Morning",
                    startTime: "2026-02-22T09:00:00Z",
                    endTime: "2026-02-22T10:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
                {
                    id: "2",
                    title: "Afternoon",
                    startTime: "2026-02-22T14:00:00Z",
                    endTime: "2026-02-22T15:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
            ];

            const layouts = computeLayouts(events);

            expect(layouts).toHaveLength(2);
            expect(layouts[0].col).toBe(0);
            expect(layouts[1].col).toBe(0);
            expect(layouts[0].cols).toBe(1);
            expect(layouts[1].cols).toBe(1);
        });

        it("should handle overlapping events in multiple columns", () => {
            const events: CalEvent[] = [
                {
                    id: "1",
                    title: "Event 1",
                    startTime: "2026-02-22T10:00:00Z",
                    endTime: "2026-02-22T11:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
                {
                    id: "2",
                    title: "Event 2",
                    startTime: "2026-02-22T10:30:00Z",
                    endTime: "2026-02-22T11:30:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
            ];

            const layouts = computeLayouts(events);

            expect(layouts).toHaveLength(2);
            expect(layouts[0].col).toBe(0);
            expect(layouts[1].col).toBe(1);
            expect(layouts[0].cols).toBe(2);
            expect(layouts[1].cols).toBe(2);
        });

        it("should handle three overlapping events", () => {
            const events: CalEvent[] = [
                {
                    id: "1",
                    title: "Event 1",
                    startTime: "2026-02-22T10:00:00Z",
                    endTime: "2026-02-22T12:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
                {
                    id: "2",
                    title: "Event 2",
                    startTime: "2026-02-22T10:30:00Z",
                    endTime: "2026-02-22T11:30:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
                {
                    id: "3",
                    title: "Event 3",
                    startTime: "2026-02-22T11:00:00Z",
                    endTime: "2026-02-22T12:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
            ];

            const layouts = computeLayouts(events);

            expect(layouts).toHaveLength(3);
            expect(layouts[0].cols).toBe(3);
            expect(layouts[1].cols).toBe(3);
            expect(layouts[2].cols).toBe(3);
        });

        it("should handle empty array", () => {
            const layouts = computeLayouts([]);
            expect(layouts).toHaveLength(0);
        });

        it("should sort events by start time", () => {
            const events: CalEvent[] = [
                {
                    id: "2",
                    title: "Later",
                    startTime: "2026-02-22T14:00:00Z",
                    endTime: "2026-02-22T15:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
                {
                    id: "1",
                    title: "Earlier",
                    startTime: "2026-02-22T10:00:00Z",
                    endTime: "2026-02-22T11:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
            ];

            const layouts = computeLayouts(events);

            expect(layouts[0].event.id).toBe("1");
            expect(layouts[1].event.id).toBe("2");
        });

        it("should handle events that touch but don't overlap", () => {
            const events: CalEvent[] = [
                {
                    id: "1",
                    title: "First",
                    startTime: "2026-02-22T10:00:00Z",
                    endTime: "2026-02-22T11:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
                {
                    id: "2",
                    title: "Second",
                    startTime: "2026-02-22T11:00:00Z",
                    endTime: "2026-02-22T12:00:00Z",
                    calendarId: "cal1",
                    allDay: false,
                    createdAt: new Date(),
                },
            ];

            const layouts = computeLayouts(events);

            expect(layouts).toHaveLength(2);
            expect(layouts[0].col).toBe(0);
            expect(layouts[1].col).toBe(0);
        });
    });
});
