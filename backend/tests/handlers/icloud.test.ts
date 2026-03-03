import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";

const mocks = vi.hoisted(() => ({
    mockCreateCalendar: vi.fn(),
    mockFetchCalendars: vi.fn(),
    mockFetchCalendarObjects: vi.fn(),
    parseICS: vi.fn(),
}));

vi.mock("../../src/services/calendarService", () => ({
    createCalendar: mocks.mockCreateCalendar,
}));

vi.mock("tsdav", () => ({
    createDAVClient: vi.fn(() => ({
        fetchCalendars: mocks.mockFetchCalendars,
        fetchCalendarObjects: mocks.mockFetchCalendarObjects,
    })),
}));

vi.mock("node-ical", () => ({
    default: {
        parseICS: mocks.parseICS,
    },
}));

import { IcloudHandler } from "../../src/handlers/icloud";

describe("IcloudHandler", () => {
    beforeEach(() => {
        resetMocks();
        vi.clearAllMocks();
    });

    it("returns empty calendars when discover credentials are invalid", async () => {
        const handler = new IcloudHandler();

        const result = await handler.discover({ username: "user" });

        expect(result).toEqual({ calendars: [] });
    });

    it("discovers calendars and maps color/display name", async () => {
        const handler = new IcloudHandler();
        mocks.mockFetchCalendars.mockResolvedValueOnce([
            {
                url: "https://caldav.icloud.com/user/cal/work/",
                displayName: "Work",
                calendarColor: "#0088ff",
            },
        ]);

        const result = await handler.discover({
            username: "user@icloud.com",
            password: "app-password",
        });

        expect(result).toEqual({
            calendars: [
                {
                    url: "https://caldav.icloud.com/user/cal/work/",
                    displayName: "Work",
                    color: "#0088ff",
                },
            ],
        });
    });

    it("returns test validation error for missing username/password", async () => {
        const handler = new IcloudHandler();

        const result = await handler.test({ username: "user@icloud.com" });

        expect(result).toEqual({
            success: false,
            error: "Missing required fields: username/password",
        });
    });

    it("returns events preview for successful test", async () => {
        const handler = new IcloudHandler();

        mocks.mockFetchCalendars.mockResolvedValueOnce([]);
        mocks.mockFetchCalendarObjects.mockResolvedValueOnce([
            { data: "BEGIN:VCALENDAR" },
        ]);
        mocks.parseICS.mockReturnValueOnce({
            a: {
                type: "VEVENT",
                uid: "evt-1",
                summary: "Family Dinner",
                start: new Date("2026-03-03T18:00:00.000Z"),
                end: new Date("2026-03-03T19:00:00.000Z"),
                datetype: "date-time",
            },
        });

        const result = await handler.test({
            username: "user@icloud.com",
            password: "app-password",
            calendarPath: "https://caldav.icloud.com/user/cal/work/",
        });

        expect(result).toEqual({
            success: true,
            eventsPreview: ["Family Dinner"],
        });
    });

    it("sync returns calendar-not-found when calendar does not exist", async () => {
        const handler = new IcloudHandler();
        mockPrisma.calendar.findUnique.mockResolvedValue(null);

        const result = await handler.sync("missing");

        expect(result).toEqual({
            success: false,
            error: "Calendar not found",
            eventsSynced: 0,
        });
    });

    it("sync returns invalid-config when required fields are missing", async () => {
        const handler = new IcloudHandler();
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: { username: "user@icloud.com" },
        });

        const result = await handler.sync("cal-1");

        expect(result).toEqual({
            success: false,
            error: "Invalid iCloud config",
            eventsSynced: 0,
        });
    });

    it("sync updates lastSync and returns 0 when remote has no events", async () => {
        const handler = new IcloudHandler();

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: {
                username: "user@icloud.com",
                password: "app-password",
                calendarPath: "https://caldav.icloud.com/user/cal/work/",
            },
        });
        mocks.mockFetchCalendars.mockResolvedValueOnce([]);
        mocks.mockFetchCalendarObjects.mockResolvedValueOnce([]);

        const result = await handler.sync("cal-1");

        expect(result).toEqual({ success: true, eventsSynced: 0 });
        expect(mockPrisma.calendar.update).toHaveBeenCalledWith({
            where: { id: "cal-1" },
            data: { lastSync: expect.any(Date) },
        });
    });

    it("sync persists events and removes stale ones", async () => {
        const handler = new IcloudHandler();

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: {
                username: "user@icloud.com",
                password: "app-password",
                calendarPath: "https://caldav.icloud.com/user/cal/work/",
            },
        });

        mocks.mockFetchCalendars.mockResolvedValueOnce([
            { url: "https://caldav.icloud.com/user/cal/work/" },
        ]);
        mocks.mockFetchCalendarObjects.mockResolvedValueOnce([
            { data: "BEGIN:VCALENDAR" },
        ]);
        mocks.parseICS.mockReturnValueOnce({
            one: {
                type: "VEVENT",
                uid: "evt-1",
                summary: "Planning",
                description: "Roadmap",
                location: "HQ",
                start: new Date("2026-03-03T10:00:00.000Z"),
                end: new Date("2026-03-03T11:00:00.000Z"),
                datetype: "date-time",
            },
        });

        const txCreateMany = vi.fn().mockResolvedValue({ count: 1 });
        const txDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
        const txCalendarUpdate = vi.fn().mockResolvedValue({});

        mockPrisma.$transaction.mockImplementationOnce(
            async (callback: any) => {
                return callback({
                    event: {
                        createMany: txCreateMany,
                        deleteMany: txDeleteMany,
                    },
                    calendar: {
                        update: txCalendarUpdate,
                    },
                });
            },
        );

        const result = await handler.sync("cal-1");

        expect(result).toEqual({ success: true, eventsSynced: 1 });
        expect(txCreateMany).toHaveBeenCalledTimes(1);
        expect(txDeleteMany).toHaveBeenCalledWith({
            where: {
                calendarId: "cal-1",
                externalId: { notIn: ["evt-1"] },
            },
        });
    });

    it("import delegates to sync when calendarId is provided", async () => {
        const handler = new IcloudHandler();
        const syncSpy = vi
            .spyOn(handler, "sync")
            .mockResolvedValue({ success: true, eventsSynced: 4 } as any);

        const result = await handler.import({ calendarId: "cal-99" });

        expect(syncSpy).toHaveBeenCalledWith("cal-99");
        expect(result).toEqual({ success: true, eventsSynced: 4 });
    });

    it("import validates credentials, user, and calendar list", async () => {
        const handler = new IcloudHandler();

        const missingCredentials = await handler.import({ userId: "u1" });
        const missingUser = await handler.import({
            credentials: { username: "u", password: "p" },
        });
        const missingCalendars = await handler.import({
            userId: "u1",
            credentials: { username: "u", password: "p" },
        });

        expect(missingCredentials).toEqual({ error: "missing-credentials" });
        expect(missingUser).toEqual({ error: "missing-user-id" });
        expect(missingCalendars).toEqual({ error: "missing-calendars" });
    });

    it("imports calendars by creating calendar records and syncing each", async () => {
        const handler = new IcloudHandler();

        mocks.mockCreateCalendar.mockResolvedValue({ id: "cal-created-1" });
        vi.spyOn(handler, "sync").mockResolvedValue({
            success: true,
            eventsSynced: 2,
        } as any);

        const result = await handler.import({
            userId: "user-1",
            credentials: {
                username: "user@icloud.com",
                password: "app-password",
            },
            calendars: [
                {
                    name: "Home",
                    url: "https://caldav.icloud.com/user/cal/home/",
                },
            ],
        });

        expect(mocks.mockCreateCalendar).toHaveBeenCalledWith({
            userId: "user-1",
            name: "Home",
            type: "icloud",
            config: {
                username: "user@icloud.com",
                password: "app-password",
                calendarPath: "https://caldav.icloud.com/user/cal/home/",
            },
        });
        expect(result).toMatchObject({ count: 1 });
    });
});
