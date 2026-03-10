import { describe, it, expect, beforeEach, vi } from "vitest";
import { IcsHandler } from "../../src/handlers/providers/ics";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { generateToken } from "../../src/utils/auth";
import ical from "node-ical";

describe("IcsHandler basic behavior", () => {
    const handler = new IcsHandler();

    beforeEach(() => {
        resetMocks();
    });

    it("returns validation error for test without url", async () => {
        const result = await handler.test({});

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid ICS config");
    });

    it("returns import validation error when user is missing", async () => {
        const result = await handler.import({
            calendars: [{ name: "Team", url: "https://example.com/team.ics" }],
        });

        expect(result).toEqual({
            success: false,
            error: "userId, name, and url/config.url are required",
            eventsSynced: 0,
        });
    });

    it("creates link export for calendar shared with requester", async () => {
        const token = generateToken("user-1");

        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [{ permission: "titles" }],
        });

        const result = await handler.export({
            type: "link",
            calendarId: "cal-1",
            userId: "user-1",
            token,
        });

        expect(result).toEqual({
            url: expect.stringContaining(
                `/api/providers/ics/export/cal-1?token=${encodeURIComponent(token)}`,
            ),
        });
    });

    it("masks subscription event details based on share permission", async () => {
        const token = generateToken("user-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [{ permission: "busy" }],
        });
        mockPrisma.event.findMany.mockResolvedValue([
            {
                id: "evt-1",
                externalId: "ext-1",
                title: "Private Meeting",
                description: "Confidential notes",
                location: "Room 101",
                startTime: new Date("2026-03-03T10:00:00.000Z"),
                endTime: new Date("2026-03-03T11:00:00.000Z"),
            },
        ]);

        const result = await handler.export({
            calendarId: "cal-1",
            subscription: true,
            token,
        });

        expect(result.body).toContain("SUMMARY:Busy");
        expect(result.body).not.toContain("DESCRIPTION:");
        expect(result.body).not.toContain("LOCATION:");
    });

    it("rejects link export when calendarId is missing", async () => {
        const result = await handler.export({
            type: "link",
            userId: "user-1",
            token: generateToken("user-1"),
        } as any);

        expect(result).toEqual({
            error: "calendarId is required for link export",
        });
    });

    it("rejects link export when token or userId is missing", async () => {
        const missingToken = await handler.export({
            type: "link",
            calendarId: "cal-1",
            userId: "user-1",
        } as any);

        const missingUser = await handler.export({
            type: "link",
            calendarId: "cal-1",
            token: generateToken("user-1"),
        } as any);

        expect(missingToken).toEqual({
            error: "Provider not found or export not supported",
        });
        expect(missingUser).toEqual({
            error: "Provider not found or export not supported",
        });
    });

    it("rejects link export when token subject does not match requester userId", async () => {
        const token = generateToken("user-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [{ permission: "full" }],
        });

        const result = await handler.export({
            type: "link",
            calendarId: "cal-1",
            userId: "user-2",
            token,
        });

        expect(result).toEqual({
            error: "Provider not found or export not supported",
        });
    });

    it("rejects subscription export without calendarId", async () => {
        const result = await handler.export({
            subscription: true,
            token: generateToken("user-1"),
        } as any);

        expect(result).toEqual({
            error: "Provider not found or export not supported",
        });
    });

    it("rejects subscription export when subscription flag or token is missing", async () => {
        const missingSubscription = await handler.export({
            calendarId: "cal-1",
            token: generateToken("user-1"),
        } as any);

        const missingToken = await handler.export({
            calendarId: "cal-1",
            subscription: true,
        } as any);

        expect(missingSubscription).toEqual({
            error: "Provider not found or export not supported",
        });
        expect(missingToken).toEqual({
            error: "Provider not found or export not supported",
        });
    });

    it("rejects subscription export when requester has no access", async () => {
        const token = generateToken("stranger-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [],
        });

        const result = await handler.export({
            calendarId: "cal-1",
            subscription: true,
            token,
        });

        expect(result).toEqual({
            error: "Provider not found or export not supported",
        });
        expect(mockPrisma.event.findMany).not.toHaveBeenCalled();
    });

    it("exports full event details for calendar owner", async () => {
        const token = generateToken("owner-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [],
        });
        mockPrisma.event.findMany.mockResolvedValue([
            {
                id: "evt-1",
                externalId: "ext-1",
                title: "Team\nMeeting",
                description: "Private\nNotes",
                location: "Room\n42",
                startTime: new Date("2026-03-03T10:00:00.000Z"),
                endTime: new Date("2026-03-03T11:00:00.000Z"),
            },
        ]);

        const result = await handler.export({
            calendarId: "cal-1",
            subscription: true,
            token,
        });

        expect(result.mimeType).toBe("text/calendar");
        expect(result.body).toContain("SUMMARY:Team Meeting");
        expect(result.body).toContain("DESCRIPTION:Private Notes");
        expect(result.body).toContain("LOCATION:Room 42");
        expect(result.body).toContain("UID:ext-1");
    });

    it("keeps title but strips description/location for titles permission", async () => {
        const token = generateToken("user-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [{ permission: "titles" }],
        });
        mockPrisma.event.findMany.mockResolvedValue([
            {
                id: "evt-1",
                externalId: null,
                title: "Planning",
                description: "Hidden",
                location: "Hidden",
                startTime: new Date("2026-03-03T10:00:00.000Z"),
                endTime: new Date("2026-03-03T11:00:00.000Z"),
            },
        ]);

        const result = await handler.export({
            calendarId: "cal-1",
            subscription: true,
            token,
        });

        expect(result.body).toContain("SUMMARY:Planning");
        expect(result.body).toContain("UID:evt-1");
        expect(result.body).not.toContain("DESCRIPTION:");
        expect(result.body).not.toContain("LOCATION:");
    });

    it("returns valid VCALENDAR payload even when there are no events", async () => {
        const token = generateToken("owner-1");
        mockPrisma.calendar.findUnique.mockResolvedValue({
            userId: "owner-1",
            shares: [],
        });
        mockPrisma.event.findMany.mockResolvedValue([]);

        const result = await handler.export({
            calendarId: "cal-1",
            subscription: true,
            token,
        });

        expect(result.body).toContain("BEGIN:VCALENDAR");
        expect(result.body).toContain("END:VCALENDAR");
        expect(result.body).not.toContain("BEGIN:VEVENT");
    });
});

describe("IcsHandler sync/import behavior", () => {
    const handler = new IcsHandler();

    beforeEach(() => {
        resetMocks();
        vi.restoreAllMocks();
    });

    it("returns calendar not found when sync target does not exist", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue(null);

        const result = await handler.sync("missing-calendar");

        expect(result).toEqual({
            success: false,
            error: "Calendar not found",
            eventsSynced: 0,
        });
    });

    it("returns fetch/config errors from sync and updates lastSync", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: {},
            user: { email: "owner@example.com" },
        });
        mockPrisma.calendar.update.mockResolvedValue({ id: "cal-1" });

        const result = await handler.sync("cal-1");

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid ICS config");
        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "cal-1" } }),
        );
    });

    it("syncs ICS events through transaction and returns created count", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: { url: "https://example.com/team.ics" },
            user: { email: "owner@example.com" },
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () =>
                    [
                        "BEGIN:VCALENDAR",
                        "BEGIN:VEVENT",
                        "UID:event-1",
                        "SUMMARY:Standup",
                        "DTSTART:20260303T100000Z",
                        "DTEND:20260303T103000Z",
                        "END:VEVENT",
                        "END:VCALENDAR",
                    ].join("\r\n"),
            }),
        );

        const tx = {
            event: {
                upsert: vi.fn().mockResolvedValue({}),
                deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            },
            calendar: {
                update: vi.fn().mockResolvedValue({ id: "cal-1" }),
            },
        };
        mockPrisma.$transaction = vi
            .fn()
            .mockImplementation(async (cb: any) => cb(tx));

        const result = await handler.sync("cal-1");

        expect(result).toEqual({ success: true, eventsSynced: 1 });
        expect(tx.event.upsert).toHaveBeenCalled();
        expect(tx.event.deleteMany).toHaveBeenCalled();
        expect(tx.calendar.update).toHaveBeenCalled();
    });

    it("sync updates existing event fields when same UID changes", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: { url: "https://example.com/team.ics" },
            user: { email: "owner@example.com" },
        });

        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    text: async () =>
                        [
                            "BEGIN:VCALENDAR",
                            "BEGIN:VEVENT",
                            "UID:event-1",
                            "SUMMARY:Standup",
                            "DESCRIPTION:First Description",
                            "LOCATION:First Location",
                            "DTSTART:20260303T100000Z",
                            "DTEND:20260303T103000Z",
                            "END:VEVENT",
                            "END:VCALENDAR",
                        ].join("\r\n"),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    text: async () =>
                        [
                            "BEGIN:VCALENDAR",
                            "BEGIN:VEVENT",
                            "UID:event-1",
                            "SUMMARY:Moved Standup",
                            "DESCRIPTION:Updated Description",
                            "LOCATION:Updated Location",
                            "DTSTART:20260303T120000Z",
                            "DTEND:20260303T130000Z",
                            "END:VEVENT",
                            "END:VCALENDAR",
                        ].join("\r\n"),
                }),
        );

        const txUpsert = vi.fn().mockResolvedValue({});
        const txDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
        const txCalendarUpdate = vi.fn().mockResolvedValue({ id: "cal-1" });

        mockPrisma.$transaction = vi.fn().mockImplementation(async (cb: any) =>
            cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: txDeleteMany,
                },
                calendar: {
                    update: txCalendarUpdate,
                },
            }),
        );

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
                update: {
                    title: "Moved Standup",
                    description: "Updated Description",
                    location: "Updated Location",
                    startTime: new Date("2026-03-03T12:00:00.000Z"),
                    endTime: new Date("2026-03-03T13:00:00.000Z"),
                    allDay: false,
                },
            }),
        );
        expect(txDeleteMany).toHaveBeenCalledTimes(2);
    });

    it("interprets floating ICS times in user's configured timezone", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: { url: "https://example.com/team.ics" },
            user: {
                email: "owner@example.com",
                settings: { timezone: "Europe/Berlin" },
            },
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () =>
                    [
                        "BEGIN:VCALENDAR",
                        "BEGIN:VEVENT",
                        "UID:event-floating",
                        "SUMMARY:Floating",
                        "DTSTART:20260303T080000",
                        "DTEND:20260303T090000",
                        "END:VEVENT",
                        "END:VCALENDAR",
                    ].join("\r\n"),
            }),
        );

        const txUpsert = vi.fn().mockResolvedValue({});
        mockPrisma.$transaction = vi.fn().mockImplementation(async (cb: any) =>
            cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({ id: "cal-1" }),
                },
            }),
        );

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

    it("uses user timezone for floating DTSTART without TZID", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: { url: "https://example.com/floating.ics" },
            user: {
                email: "owner@example.com",
                settings: { timezone: "Europe/Berlin" },
            },
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () =>
                    [
                        "BEGIN:VCALENDAR",
                        "BEGIN:VEVENT",
                        "UID:floating-2",
                        "SUMMARY:Morning",
                        "DTSTART:20260303T080000",
                        "DTEND:20260303T090000",
                        "END:VEVENT",
                        "END:VCALENDAR",
                    ].join("\r\n"),
            }),
        );

        const txUpsert = vi.fn().mockResolvedValue({});
        mockPrisma.$transaction = vi.fn().mockImplementation(async (cb: any) =>
            cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({ id: "cal-1" }),
                },
            }),
        );

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

    it("uses calendar-level X-WR-TIMEZONE for floating times before user timezone", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: { url: "https://example.com/floating-berlin.ics" },
            user: {
                email: "owner@example.com",
                settings: { timezone: "Europe/London" },
            },
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () =>
                    [
                        "BEGIN:VCALENDAR",
                        "X-WR-TIMEZONE:Europe/Berlin",
                        "BEGIN:VEVENT",
                        "UID:floating-berlin-1",
                        "SUMMARY:Berlin Floating",
                        "DTSTART:20260303T080000",
                        "DTEND:20260303T090000",
                        "END:VEVENT",
                        "END:VCALENDAR",
                    ].join("\r\n"),
            }),
        );

        const txUpsert = vi.fn().mockResolvedValue({});
        mockPrisma.$transaction = vi.fn().mockImplementation(async (cb: any) =>
            cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({ id: "cal-1" }),
                },
            }),
        );

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

    it("converts summer floating times using DST offset", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: { url: "https://example.com/summer.ics" },
            user: {
                email: "owner@example.com",
                settings: { timezone: "Europe/Berlin" },
            },
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () =>
                    [
                        "BEGIN:VCALENDAR",
                        "BEGIN:VEVENT",
                        "UID:summer-1",
                        "SUMMARY:Summer Floating",
                        "DTSTART:20260715T080000",
                        "DTEND:20260715T090000",
                        "END:VEVENT",
                        "END:VCALENDAR",
                    ].join("\r\n"),
            }),
        );

        const txUpsert = vi.fn().mockResolvedValue({});
        mockPrisma.$transaction = vi.fn().mockImplementation(async (cb: any) =>
            cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({ id: "cal-1" }),
                },
            }),
        );

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

    it("does not convert VALUE=DATE all-day events", async () => {
        const icsText = [
            "BEGIN:VCALENDAR",
            "BEGIN:VEVENT",
            "UID:allday-1",
            "SUMMARY:All Day",
            "DTSTART;VALUE=DATE:20260715",
            "DTEND;VALUE=DATE:20260716",
            "END:VEVENT",
            "END:VCALENDAR",
        ].join("\r\n");
        const parsed = Object.values(ical.parseICS(icsText)).find(
            (e: any) => e?.type === "VEVENT",
        ) as any;

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: { url: "https://example.com/allday.ics" },
            user: {
                email: "owner@example.com",
                settings: { timezone: "Europe/Berlin" },
            },
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => icsText,
            }),
        );

        const txUpsert = vi.fn().mockResolvedValue({});
        mockPrisma.$transaction = vi.fn().mockImplementation(async (cb: any) =>
            cb({
                event: {
                    upsert: txUpsert,
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({ id: "cal-1" }),
                },
            }),
        );

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

    it("returns database error during sync transaction failure", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: { url: "https://example.com/team.ics" },
            user: { email: "owner@example.com" },
        });

        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () =>
                    [
                        "BEGIN:VCALENDAR",
                        "BEGIN:VEVENT",
                        "UID:event-1",
                        "SUMMARY:Standup",
                        "DTSTART:20260303T100000Z",
                        "DTEND:20260303T103000Z",
                        "END:VEVENT",
                        "END:VCALENDAR",
                    ].join("\r\n"),
            }),
        );

        mockPrisma.$transaction = vi
            .fn()
            .mockRejectedValue(new Error("tx failure"));

        const result = await handler.sync("cal-1");

        expect(result).toEqual({
            success: false,
            error: "Database error during sync",
            eventsSynced: 0,
        });
    });

    it("import delegates directly to sync when calendarId is provided", async () => {
        const syncSpy = vi
            .spyOn(handler, "sync")
            .mockResolvedValue({ success: true, eventsSynced: 7 });

        const result = await handler.import({ calendarId: "cal-1" });

        expect(syncSpy).toHaveBeenCalledWith("cal-1");
        expect(result).toEqual({ success: true, eventsSynced: 7 });
    });

    it("import creates calendar and then syncs it", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue(null);

        const createCalendarSpy = vi
            .spyOn(
                await import("../../src/services/calendarService"),
                "createCalendar",
            )
            .mockResolvedValue({ id: "new-cal" } as any);
        const syncSpy = vi
            .spyOn(handler, "sync")
            .mockResolvedValue({ success: true, eventsSynced: 3 });

        const result = await handler.import({
            userId: "user-1",
            name: "Team",
            url: "https://example.com/team.ics",
        });

        expect(createCalendarSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: "user-1",
                name: "Team",
                type: "ics",
                url: "https://example.com/team.ics",
            }),
        );
        expect(syncSpy).toHaveBeenCalledWith("new-cal");
        expect(result).toEqual({ success: true, eventsSynced: 3 });
    });
});

describe("IcsHandler connection fallback behavior", () => {
    const handler = new IcsHandler();

    beforeEach(() => {
        resetMocks();
        vi.restoreAllMocks();
    });

    it("returns unauthorized when upstream responds 401", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({ ok: false, status: 401 }),
        );

        const result = await handler.test({
            url: "https://private.example.com/calendar.ics",
            username: "alice",
            password: "wrong",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Unauthorized: wrong username/password");
    });

    it("falls back from https to http and succeeds", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({ ok: false, status: 500 })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () =>
                    [
                        "BEGIN:VCALENDAR",
                        "BEGIN:VEVENT",
                        "UID:event-1",
                        "SUMMARY:Fallback Success",
                        "DTSTART:20260303T100000Z",
                        "DTEND:20260303T103000Z",
                        "END:VEVENT",
                        "END:VCALENDAR",
                    ].join("\r\n"),
            });

        vi.stubGlobal("fetch", fetchMock);

        const result = await handler.test({ url: "http://example.com/a.ics" });

        expect(result.success).toBe(true);
        expect(result.eventsPreview).toEqual(["Fallback Success"]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("normalizes webcal URLs and succeeds", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () =>
                [
                    "BEGIN:VCALENDAR",
                    "BEGIN:VEVENT",
                    "UID:event-1",
                    "SUMMARY:Webcal Feed",
                    "DTSTART:20260303T100000Z",
                    "DTEND:20260303T103000Z",
                    "END:VEVENT",
                    "END:VCALENDAR",
                ].join("\r\n"),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await handler.test({
            url: "webcal://calendar.example.com/feed.ics",
        });

        expect(result.success).toBe(true);
        const calledUrl = String(fetchMock.mock.calls[0][0]);
        expect(calledUrl.startsWith("https://")).toBe(true);
    });

    it("returns invalid data error when response is not VCALENDAR", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () => "not an ics payload",
            }),
        );

        const result = await handler.test({
            url: "https://example.com/bad.ics",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid ICS data");
    });

    it("returns no events found when VCALENDAR has no VEVENT", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                text: async () =>
                    [
                        "BEGIN:VCALENDAR",
                        "VERSION:2.0",
                        "PRODID:-//test//EN",
                        "END:VCALENDAR",
                    ].join("\r\n"),
            }),
        );

        const result = await handler.test({
            url: "https://example.com/empty.ics",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("No events found");
    });
});
