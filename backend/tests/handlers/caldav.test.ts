import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaldavHandler } from "../../src/handlers/providers/caldav";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import ical from "node-ical";

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
    "DESCRIPTION:First Description",
    "LOCATION:First Location",
    "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n");

const ICS_EVENT_MOVED = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:event-1",
    "DTSTART:20260303T120000Z",
    "DTEND:20260303T130000Z",
    "SUMMARY:Moved Test",
    "DESCRIPTION:Updated Description",
    "LOCATION:Updated Location",
    "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n");

const ICS_EVENT_FLOATING = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:event-floating",
    "DTSTART:20260303T080000",
    "DTEND:20260303T090000",
    "SUMMARY:Floating",
    "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n");

const ICS_EVENT_FLOATING_SUMMER = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:event-floating-summer",
    "DTSTART:20260715T080000",
    "DTEND:20260715T090000",
    "SUMMARY:Floating Summer",
    "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n");

const ICS_EVENT_VTIMEZONE = [
    "BEGIN:VCALENDAR",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Berlin",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    "UID:event-vtimezone",
    "DTSTART:20260303T080000",
    "DTEND:20260303T090000",
    "SUMMARY:VTZ",
    "END:VEVENT",
    "END:VCALENDAR",
].join("\r\n");

const ICS_EVENT_VALUE_DATE = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:event-allday",
    "DTSTART;VALUE=DATE:20260715",
    "DTEND;VALUE=DATE:20260716",
    "SUMMARY:All Day",
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
                    upsert: vi.fn().mockResolvedValue({}),
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

    it("discover returns empty list when credentials are invalid", async () => {
        const result = await handler.discover({ username: "u" });
        expect(result).toEqual({ calendars: [] });
    });

    it("discover returns empty list when calendar fetch throws", async () => {
        mockFetchCalendars.mockRejectedValueOnce(new Error("boom"));

        const result = await handler.discover({
            url: CALDAV_URL,
            username: CALDAV_USER,
            password: GOOD_PASSWORD,
        });

        expect(result).toEqual({ calendars: [] });
    });

    it("discover maps calendars when credentials are valid", async () => {
        mockFetchCalendars.mockResolvedValueOnce([
            {
                url: "https://example.com/cal/work/",
                displayName: "Work",
                calendarColor: "#00AAFF",
            },
        ]);

        const result = await handler.discover({
            url: CALDAV_URL,
            username: CALDAV_USER,
            password: GOOD_PASSWORD,
        });

        expect(result).toEqual({
            calendars: [
                {
                    url: "https://example.com/cal/work/",
                    displayName: "Work",
                    color: "#00AAFF",
                },
            ],
        });
    });

    it("test returns missing-url error when url is absent", async () => {
        const result = await handler.test({ username: CALDAV_USER });
        expect(result).toEqual({
            success: false,
            error: "Missing required field: url",
        });
    });

    it("test returns event preview when connection succeeds", async () => {
        mockFetchCalendarObjects.mockResolvedValueOnce([{ data: ICS_EVENT }]);

        const result = await handler.test({
            url: CALDAV_URL,
            username: CALDAV_USER,
            password: GOOD_PASSWORD,
        });

        expect(result).toEqual({
            success: true,
            eventsPreview: ["Test"],
        });
    });

    it("test returns failure details when event fetch throws", async () => {
        mockFetchCalendarObjects.mockRejectedValueOnce(new Error("forbidden"));

        const result = await handler.test({
            url: CALDAV_URL,
            username: CALDAV_USER,
            password: GOOD_PASSWORD,
        });

        expect(result).toEqual({
            success: false,
            error: "forbidden",
        });
    });

    it("sync returns calendar-not-found for unknown id", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue(null);

        const result = await handler.sync("missing-id");

        expect(result).toEqual({
            success: false,
            error: "Calendar not found",
            eventsSynced: 0,
        });
    });

    it("sync returns invalid config for malformed calendar config", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: {},
        } as any);

        const result = await handler.sync("cal-1");

        expect(result).toEqual({
            success: false,
            error: "Invalid CalDAV config",
            eventsSynced: 0,
        });
    });

    it("sync updates lastSync and returns fetch error", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
        } as any);
        mockFetchCalendarObjects.mockRejectedValueOnce(
            new Error("fetch-failed"),
        );

        const result = await handler.sync("cal-1");

        expect(result).toEqual({
            success: false,
            error: "fetch-failed",
            eventsSynced: 0,
        });
        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "cal-1" } }),
        );
    });

    it("sync returns zero when remote calendar has no events", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
        } as any);
        mockFetchCalendarObjects.mockResolvedValueOnce([]);

        const result = await handler.sync("cal-1");

        expect(result).toEqual({ success: true, eventsSynced: 0 });
    });

    it("sync returns database error when transaction fails", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
        } as any);
        mockFetchCalendarObjects.mockResolvedValueOnce([{ data: ICS_EVENT }]);
        mockPrisma.$transaction.mockRejectedValueOnce(new Error("tx-failed"));

        const result = await handler.sync("cal-1");

        expect(result).toEqual({
            success: false,
            error: "Database error during sync",
            eventsSynced: 0,
        });
    });

    it("sync updates existing event when same external id changes time", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
        } as any);

        mockFetchCalendarObjects
            .mockResolvedValueOnce([{ data: ICS_EVENT }])
            .mockResolvedValueOnce([{ data: ICS_EVENT_MOVED }]);

        const txUpsert = vi.fn().mockResolvedValue({});
        const txDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
        const txCalendarUpdate = vi.fn().mockResolvedValue({});

        mockPrisma.$transaction.mockImplementation(async (cb: any) => {
            return cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: txDeleteMany,
                },
                calendar: {
                    update: txCalendarUpdate,
                },
            });
        });

        const first = await handler.sync("cal-1");
        const second = await handler.sync("cal-1");

        expect(first).toEqual({ success: true, eventsSynced: 1 });
        expect(second).toEqual({ success: true, eventsSynced: 1 });
        expect(txUpsert).toHaveBeenCalledTimes(2);

        expect(txUpsert).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: {
                    calendarId_externalId: {
                        calendarId: "cal-1",
                        externalId: "event-1",
                    },
                },
                update: expect.objectContaining({
                    title: "Moved Test",
                    description: "Updated Description",
                    location: "Updated Location",
                    startTime: new Date("2026-03-03T12:00:00.000Z"),
                    endTime: new Date("2026-03-03T13:00:00.000Z"),
                    allDay: false,
                }),
            }),
        );
        expect(txDeleteMany).toHaveBeenCalledTimes(2);
    });

    it("sync interprets floating times using user timezone", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
            user: { settings: { timezone: "Europe/Berlin" } },
        } as any);

        mockFetchCalendarObjects.mockResolvedValueOnce([
            { data: ICS_EVENT_FLOATING },
        ]);

        const txUpsert = vi.fn().mockResolvedValue({});
        mockPrisma.$transaction.mockImplementation(async (cb: any) => {
            return cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({}),
                },
            });
        });

        const result = await handler.sync("cal-1");

        expect(result).toEqual({ success: true, eventsSynced: 1 });
        expect(txUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    startTime: new Date("2026-03-03T07:00:00.000Z"),
                    endTime: new Date("2026-03-03T08:00:00.000Z"),
                }),
            }),
        );
    });

    it("sync applies DST offset for summer floating times", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
            user: { settings: { timezone: "Europe/Berlin" } },
        } as any);

        mockFetchCalendarObjects.mockResolvedValueOnce([
            { data: ICS_EVENT_FLOATING_SUMMER },
        ]);

        const txUpsert = vi.fn().mockResolvedValue({});
        mockPrisma.$transaction.mockImplementation(async (cb: any) => {
            return cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({}),
                },
            });
        });

        const result = await handler.sync("cal-1");

        expect(result).toEqual({ success: true, eventsSynced: 1 });
        expect(txUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    startTime: new Date("2026-07-15T06:00:00.000Z"),
                    endTime: new Date("2026-07-15T07:00:00.000Z"),
                }),
            }),
        );
    });

    it("sync uses VTIMEZONE TZID before user timezone for floating times", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
            user: { settings: { timezone: "Europe/London" } },
        } as any);

        mockFetchCalendarObjects.mockResolvedValueOnce([
            { data: ICS_EVENT_VTIMEZONE },
        ]);

        const txUpsert = vi.fn().mockResolvedValue({});
        mockPrisma.$transaction.mockImplementation(async (cb: any) => {
            return cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({}),
                },
            });
        });

        const result = await handler.sync("cal-1");

        expect(result).toEqual({ success: true, eventsSynced: 1 });
        expect(txUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    startTime: new Date("2026-03-03T07:00:00.000Z"),
                    endTime: new Date("2026-03-03T08:00:00.000Z"),
                }),
            }),
        );
    });

    it("sync does not convert VALUE=DATE all-day events", async () => {
        const parsed = Object.values(ical.parseICS(ICS_EVENT_VALUE_DATE)).find(
            (e: any) => e?.type === "VEVENT",
        ) as any;

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: createCalendarConfig(GOOD_PASSWORD),
            user: { settings: { timezone: "Europe/Berlin" } },
        } as any);

        mockFetchCalendarObjects.mockResolvedValueOnce([
            { data: ICS_EVENT_VALUE_DATE },
        ]);

        const txUpsert = vi.fn().mockResolvedValue({});
        mockPrisma.$transaction.mockImplementation(async (cb: any) => {
            return cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({}),
                },
            });
        });

        const result = await handler.sync("cal-1");

        expect(result).toEqual({ success: true, eventsSynced: 1 });
        expect(txUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                create: expect.objectContaining({
                    startTime: new Date(parsed.start),
                    endTime: new Date(parsed.end),
                    allDay: true,
                }),
            }),
        );
    });

    it("import returns missing-user-id when user id is absent", async () => {
        const result = await handler.import({
            credentials: {
                url: CALDAV_URL,
                username: CALDAV_USER,
                password: GOOD_PASSWORD,
            },
        });

        expect(result).toEqual({ error: "missing-user-id" });
    });

    it("import uses name/url fallback calendar list path", async () => {
        mockFetchCalendarObjects
            .mockResolvedValueOnce([{ data: ICS_EVENT }])
            .mockResolvedValueOnce([{ data: ICS_EVENT }]);

        vi.mocked(calendarService.createCalendar).mockResolvedValue({
            id: "cal-from-name",
        } as any);

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-from-name",
            config: createCalendarConfig(GOOD_PASSWORD),
        } as any);

        mockPrisma.$transaction.mockImplementationOnce(async (cb: any) => {
            const tx = {
                event: {
                    upsert: vi.fn().mockResolvedValue({}),
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
            name: "Named Cal",
            url: CALDAV_URL,
        });

        expect(result).toMatchObject({ count: 1 });
        expect(calendarService.createCalendar).toHaveBeenCalledWith(
            expect.objectContaining({ name: "Named Cal" }),
        );
    });

    it("import uses credentials.url fallback when calendars and name are missing", async () => {
        mockFetchCalendarObjects
            .mockResolvedValueOnce([{ data: ICS_EVENT }])
            .mockResolvedValueOnce([{ data: ICS_EVENT }]);

        vi.mocked(calendarService.createCalendar).mockResolvedValue({
            id: "cal-from-credentials",
        } as any);

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-from-credentials",
            config: createCalendarConfig(GOOD_PASSWORD),
        } as any);

        mockPrisma.$transaction.mockImplementationOnce(async (cb: any) => {
            const tx = {
                event: {
                    upsert: vi.fn().mockResolvedValue({}),
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
        expect(calendarService.createCalendar).toHaveBeenCalledWith(
            expect.objectContaining({ name: CALDAV_URL }),
        );
    });
});
