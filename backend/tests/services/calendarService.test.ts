import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { createMockCalendar, createMockEvent } from "../helpers/factories";
import * as calendarService from "../../src/services/calendarService";

beforeEach(() => resetMocks());

describe("getUserCalendars", () => {
    it("returns calendars for user with shares and events", async () => {
        const calendar = createMockCalendar("user-1");
        const event = createMockEvent(calendar.id);
        mockPrisma.calendar.findMany.mockResolvedValue([
            { ...calendar, shares: [], events: [event] },
        ]);

        const result = await calendarService.getUserCalendars("user-1");

        expect(result).toHaveLength(1);
        expect(result[0].events).toHaveLength(1);
        expect(mockPrisma.calendar.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { userId: "user-1" } }),
        );
    });

    it("returns empty array when user has no calendars", async () => {
        mockPrisma.calendar.findMany.mockResolvedValue([]);
        const result = await calendarService.getUserCalendars("user-1");
        expect(result).toHaveLength(0);
    });
});

describe("findCalendarForUser", () => {
    it("returns calendar when user owns it", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.findFirst.mockResolvedValue({
            ...calendar,
            shares: [],
        });

        const result = await calendarService.findCalendarForUser(
            calendar.id,
            "user-1",
        );

        expect(result).not.toBeNull();
        expect(result?.id).toBe(calendar.id);
        expect(mockPrisma.calendar.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: calendar.id, userId: "user-1" },
            }),
        );
    });

    it("returns null when calendar belongs to another user", async () => {
        mockPrisma.calendar.findFirst.mockResolvedValue(null);
        const result = await calendarService.findCalendarForUser(
            "cal-1",
            "user-1",
        );
        expect(result).toBeNull();
    });
});

describe("createCalendar", () => {
    it("creates calendar with url in config when url provided", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.create.mockResolvedValue(calendar);

        await calendarService.createCalendar({
            userId: "user-1",
            name: "My Cal",
            type: "ics",
            url: "https://example.com/cal.ics",
        });

        expect(mockPrisma.calendar.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    config: { url: "https://example.com/cal.ics" },
                }),
            }),
        );
    });

    it("creates calendar with empty config when no url and no config", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.create.mockResolvedValue(calendar);

        await calendarService.createCalendar({
            userId: "user-1",
            name: "My Cal",
            type: "ics",
        });

        expect(mockPrisma.calendar.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ config: {} }),
            }),
        );
    });

    it("uses provided config over url", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.create.mockResolvedValue(calendar);

        await calendarService.createCalendar({
            userId: "user-1",
            name: "My Cal",
            type: "ics",
            url: "https://example.com/cal.ics",
            config: { custom: "value" },
        });

        expect(mockPrisma.calendar.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ config: { custom: "value" } }),
            }),
        );
    });
});

describe("updateCalendar", () => {
    it("updates calendar when user owns it", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.calendar.update.mockResolvedValue({
            ...calendar,
            name: "Updated",
        });

        const result = await calendarService.updateCalendar({
            userId: "user-1",
            calendarId: calendar.id,
            name: "Updated",
        });

        expect(result).not.toBeNull();
        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { name: "Updated" },
            }),
        );
    });

    it("returns null when calendar not owned by user", async () => {
        mockPrisma.calendar.findFirst.mockResolvedValue(null);

        const result = await calendarService.updateCalendar({
            userId: "user-1",
            calendarId: "cal-1",
            name: "Updated",
        });

        expect(result).toBeNull();
        expect(mockPrisma.calendar.update).not.toHaveBeenCalled();
    });

    it("only updates provided fields", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.calendar.update.mockResolvedValue(calendar);

        await calendarService.updateCalendar({
            userId: "user-1",
            calendarId: calendar.id,
            syncInterval: 30,
        });

        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { syncInterval: 30 },
            }),
        );
    });

    it("updates multiple fields at once", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.calendar.update.mockResolvedValue(calendar);

        await calendarService.updateCalendar({
            userId: "user-1",
            calendarId: calendar.id,
            name: "New Name",
            syncInterval: 30,
            config: { key: "value" },
        });

        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    name: "New Name",
                    syncInterval: 30,
                    config: { key: "value" },
                },
            }),
        );
    });

    it("does not include undefined fields in update data", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.calendar.update.mockResolvedValue(calendar);

        await calendarService.updateCalendar({
            userId: "user-1",
            calendarId: calendar.id,
        });

        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
            expect.objectContaining({ data: {} }),
        );
    });
});

describe("deleteCalendar", () => {
    it("deletes calendar and related data when user owns it", async () => {
        const calendar = createMockCalendar("user-1");
        mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
        mockPrisma.$transaction.mockResolvedValue([]);

        const result = await calendarService.deleteCalendar(
            "user-1",
            calendar.id,
        );

        expect(result).toBe(true);
        expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it("returns false when calendar not owned by user", async () => {
        mockPrisma.calendar.findFirst.mockResolvedValue(null);

        const result = await calendarService.deleteCalendar("user-1", "cal-1");

        expect(result).toBe(false);
        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
});

describe("userOwnsCalendar", () => {
    it("returns true when user owns calendar", async () => {
        mockPrisma.calendar.count.mockResolvedValue(1);
        const result = await calendarService.userOwnsCalendar(
            "user-1",
            "cal-1",
        );
        expect(result).toBe(true);
    });

    it("returns false when user does not own calendar", async () => {
        mockPrisma.calendar.count.mockResolvedValue(0);
        const result = await calendarService.userOwnsCalendar(
            "user-1",
            "cal-1",
        );
        expect(result).toBe(false);
    });
});
