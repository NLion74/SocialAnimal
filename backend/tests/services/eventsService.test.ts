import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import {
    createMockCalendar,
    createMockEvent,
    createMockUser,
} from "../helpers/factories";
import * as eventsService from "../../src/services/eventsService";

beforeEach(() => resetMocks());

describe("getEvents", () => {
    it("returns events for user", async () => {
        const event = createMockEvent("cal-1");
        mockPrisma.event.findMany.mockResolvedValue([event]);

        const result = await eventsService.getEvents({ userId: "user-1" });

        expect(result).toHaveLength(1);
        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { calendar: { userId: "user-1" } },
            }),
        );
    });

    it("filters by calendarId when provided", async () => {
        mockPrisma.event.findMany.mockResolvedValue([]);

        await eventsService.getEvents({
            userId: "user-1",
            calendarId: "cal-1",
        });

        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ calendarId: "cal-1" }),
            }),
        );
    });

    it("filters by start date when provided", async () => {
        mockPrisma.event.findMany.mockResolvedValue([]);

        await eventsService.getEvents({
            userId: "user-1",
            start: "2026-01-01T00:00:00Z",
        });

        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    startTime: { gte: new Date("2026-01-01T00:00:00Z") },
                }),
            }),
        );
    });

    it("filters by end date when provided", async () => {
        mockPrisma.event.findMany.mockResolvedValue([]);

        await eventsService.getEvents({
            userId: "user-1",
            end: "2026-12-31T00:00:00Z",
        });

        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    startTime: { lte: new Date("2026-12-31T00:00:00Z") },
                }),
            }),
        );
    });

    it("filters by both start and end date", async () => {
        mockPrisma.event.findMany.mockResolvedValue([]);

        await eventsService.getEvents({
            userId: "user-1",
            start: "2026-01-01T00:00:00Z",
            end: "2026-12-31T00:00:00Z",
        });

        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    startTime: {
                        gte: new Date("2026-01-01T00:00:00Z"),
                        lte: new Date("2026-12-31T00:00:00Z"),
                    },
                }),
            }),
        );
    });

    it("filters by calendarId and date range together", async () => {
        mockPrisma.event.findMany.mockResolvedValue([]);

        await eventsService.getEvents({
            userId: "user-1",
            calendarId: "cal-1",
            start: "2026-01-01T00:00:00Z",
            end: "2026-12-31T00:00:00Z",
        });

        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    calendarId: "cal-1",
                    startTime: {
                        gte: new Date("2026-01-01T00:00:00Z"),
                        lte: new Date("2026-12-31T00:00:00Z"),
                    },
                }),
            }),
        );
    });

    it("returns empty array when no events match", async () => {
        mockPrisma.event.findMany.mockResolvedValue([]);
        const result = await eventsService.getEvents({ userId: "user-1" });
        expect(result).toEqual([]);
    });
});

describe("getFriendEvents", () => {
    it("returns shared events grouped by permission and owner", async () => {
        const owner = createMockUser({ id: "owner-1", name: "Owner" });
        const calendar = createMockCalendar(owner.id);
        const event = createMockEvent(calendar.id, { title: "Shared Event" });

        mockPrisma.calendarShare.findMany.mockResolvedValue([
            {
                id: "share-1",
                calendarId: calendar.id,
                sharedWithId: "user-1",
                permission: "full",
                createdAt: new Date(),
                calendar: {
                    ...calendar,
                    user: {
                        id: owner.id,
                        name: owner.name,
                        email: owner.email,
                    },
                    events: [
                        {
                            ...event,
                            calendar: {
                                id: calendar.id,
                                name: calendar.name,
                                type: calendar.type,
                            },
                        },
                    ],
                },
            },
        ]);

        const result = await eventsService.getFriendEvents("user-1");

        expect(result).toHaveLength(1);
        expect(result[0].event.title).toBe("Shared Event");
        expect(result[0].permission).toBe("full");
        expect(result[0].owner.id).toBe(owner.id);
    });

    it("returns empty array when no calendars are shared with user", async () => {
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);
        const result = await eventsService.getFriendEvents("user-1");
        expect(result).toHaveLength(0);
    });

    it("returns events from multiple shared calendars", async () => {
        const owner = createMockUser({ id: "owner-1" });
        const cal1 = createMockCalendar(owner.id);
        const cal2 = createMockCalendar(owner.id);
        const event1 = createMockEvent(cal1.id, { title: "Event 1" });
        const event2 = createMockEvent(cal2.id, { title: "Event 2" });

        mockPrisma.calendarShare.findMany.mockResolvedValue([
            {
                id: "share-1",
                calendarId: cal1.id,
                sharedWithId: "user-1",
                permission: "full",
                createdAt: new Date(),
                calendar: {
                    ...cal1,
                    user: {
                        id: owner.id,
                        name: owner.name,
                        email: owner.email,
                    },
                    events: [
                        {
                            ...event1,
                            calendar: {
                                id: cal1.id,
                                name: cal1.name,
                                type: cal1.type,
                            },
                        },
                    ],
                },
            },
            {
                id: "share-2",
                calendarId: cal2.id,
                sharedWithId: "user-1",
                permission: "busy",
                createdAt: new Date(),
                calendar: {
                    ...cal2,
                    user: {
                        id: owner.id,
                        name: owner.name,
                        email: owner.email,
                    },
                    events: [
                        {
                            ...event2,
                            calendar: {
                                id: cal2.id,
                                name: cal2.name,
                                type: cal2.type,
                            },
                        },
                    ],
                },
            },
        ]);

        const result = await eventsService.getFriendEvents("user-1");

        expect(result).toHaveLength(2);
        expect(result.map((r: any) => r.event.title)).toContain("Event 1");
        expect(result.map((r: any) => r.event.title)).toContain("Event 2");
    });
});
