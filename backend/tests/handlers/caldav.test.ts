import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaldavHandler } from "../../src/handlers/caldav";
import { mockPrisma, resetMocks } from "../helpers/prisma";

const mockFetchCalendars = vi.fn();
const mockFetchCalendarObjects = vi.fn();

vi.mock("tsdav", () => ({
    createDAVClient: vi.fn(() => ({
        fetchCalendars: mockFetchCalendars,
        fetchCalendarObjects: mockFetchCalendarObjects,
    })),
}));

vi.mock("../../src/services/calendarService", () => ({
    createCalendar: vi.fn(),
}));

import * as calendarService from "../../src/services/calendarService";

const CALDAV_URL = "http://localhost:5232/testuser/calendar/";
const CALDAV_USER = "testuser";
const GOOD_PASSWORD = "good-password";

const ICS_EVENT = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:event-1",
    "DTSTART:20260303T100000Z",
    "DTEND:20260303T110000Z",
    "SUMMARY:Test",
    "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n");

const createCalendarConfig = (password: string) => ({
    url: CALDAV_URL,
    username: CALDAV_USER,
    password,
    calendarPath: CALDAV_URL,
});

describe("CaldavHandler import behavior", () => {
    const handler = new CaldavHandler();

    beforeEach(() => {
        resetMocks();
        mockFetchCalendars.mockReset();
        mockFetchCalendarObjects.mockReset();
        vi.mocked(calendarService.createCalendar).mockReset();

        mockFetchCalendars.mockResolvedValue([]);
        mockPrisma.calendar.update.mockResolvedValue({} as any);
        mockPrisma.calendar.delete.mockResolvedValue({} as any);
    });

    it("returns missing-url for invalid credentials", async () => {
        const result = await handler.import({ userId: "user-1" });
        expect(result).toEqual({ error: "missing-url" });
    });

    it("does not create calendar when direct fetch preflight fails", async () => {
        mockFetchCalendarObjects.mockRejectedValueOnce(
            new Error("Unauthorized"),
        );

        const result = await handler.import({
            userId: "user-1",
            credentials: {
                url: CALDAV_URL,
                username: CALDAV_USER,
                password: "bad-password",
            },
        });

        expect(result).toEqual({ error: "Unauthorized" });
        expect(calendarService.createCalendar).not.toHaveBeenCalled();
    });

    it("rolls back created calendar when sync fails after creation", async () => {
        mockFetchCalendarObjects
            .mockResolvedValueOnce([{ data: ICS_EVENT }])
            .mockRejectedValueOnce(new Error("Sync fetch failed"));

        vi.mocked(calendarService.createCalendar).mockResolvedValue({
            id: "cal-1",
        } as any);

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
        } as any);

        const result = await handler.import({
            userId: "user-1",
            credentials: {
                url: CALDAV_URL,
                username: CALDAV_USER,
                password: GOOD_PASSWORD,
            },
            calendars: [
                {
                    name: "Personal",
                    url: CALDAV_URL,
                },
            ],
        });

        expect(result).toEqual({ error: "Sync fetch failed" });
        expect(calendarService.createCalendar).toHaveBeenCalledTimes(1);
        expect(mockPrisma.calendar.delete).toHaveBeenCalledWith({
            where: { id: "cal-1" },
        });
    });

    it("imports direct url successfully when preflight and sync pass", async () => {
        mockFetchCalendarObjects
            .mockResolvedValueOnce([{ data: ICS_EVENT }])
            .mockResolvedValueOnce([{ data: ICS_EVENT }]);

        vi.mocked(calendarService.createCalendar).mockResolvedValue({
            id: "cal-1",
            name: "Personal",
        } as any);

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
        } as any);

        mockPrisma.$transaction.mockImplementationOnce(async (cb: any) => {
            const tx = {
                event: {
                    createMany: vi.fn().mockResolvedValue({ count: 1 }),
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({}),
                },
            };

            return cb(tx);
        });

        const result = await handler.import({
            userId: "user-1",
            credentials: {
                url: CALDAV_URL,
                username: CALDAV_USER,
                password: GOOD_PASSWORD,
            },
        });

        expect(result).toMatchObject({ count: 1 });
        expect(calendarService.createCalendar).toHaveBeenCalledTimes(1);
        expect(mockPrisma.calendar.delete).not.toHaveBeenCalled();
    });
});
