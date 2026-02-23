import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import {
    fetchIcs,
    syncIcsCalendar,
    testIcsConnection,
} from "../../src/syncs/ics";
import { createMockCalendar } from "../helpers/factories";

beforeEach(() => resetMocks());
afterEach(() => vi.restoreAllMocks());

const VALID_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:event-1@test.com
SUMMARY:Test Event
DTSTART:20260301T100000Z
DTEND:20260301T110000Z
END:VEVENT
END:VCALENDAR`;

const EMPTY_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
END:VCALENDAR`;

function mockFetch(response: Partial<Response>, body = VALID_ICS) {
    vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => body,
        ...response,
    } as Response);
}

describe("fetchIcs", () => {
    it("fetches and returns ICS text", async () => {
        mockFetch({});

        const result = await fetchIcs({ url: "https://example.com/cal.ics" });

        expect(result).toContain("BEGIN:VCALENDAR");
        expect(result).toContain("Test Event");
    });

    it("converts webcal:// to https://", async () => {
        mockFetch({});

        await fetchIcs({ url: "webcal://example.com/cal.ics" });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("https://"),
            expect.any(Object),
        );
    });

    it("throws on 401 unauthorized", async () => {
        mockFetch({ ok: false, status: 401 });

        await expect(
            fetchIcs({ url: "https://example.com/cal.ics" }),
        ).rejects.toThrow("Unauthorized");
    });

    it("throws when response is not valid ICS", async () => {
        mockFetch({}, "not ics data");

        await expect(
            fetchIcs({ url: "https://example.com/cal.ics" }),
        ).rejects.toThrow();
    });

    it("throws when ICS has no events", async () => {
        mockFetch({}, EMPTY_ICS);

        await expect(
            fetchIcs({ url: "https://example.com/cal.ics" }),
        ).rejects.toThrow("No events found");
    });

    it("sends Basic auth header when credentials provided", async () => {
        mockFetch({});

        await fetchIcs({
            url: "https://example.com/cal.ics",
            username: "user",
            password: "pass",
        });

        expect(fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: expect.stringContaining("Basic "),
                }),
            }),
        );
    });

    it("throws when no url provided", async () => {
        await expect(fetchIcs({ url: "" })).rejects.toThrow(
            "No ICS URL provided",
        );
    });

    it("uses http for localhost URLs", async () => {
        mockFetch({});

        await fetchIcs({ url: "https://localhost:3000/cal.ics" });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("http://localhost"),
            expect.any(Object),
        );
    });

    it("throws when fetch fails", async () => {
        vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

        await expect(
            fetchIcs({ url: "https://example.com/cal.ics" }),
        ).rejects.toThrow("Network error");
    });
});

describe("syncIcsCalendar", () => {
    const makeCalendar = (
        config: any = { url: "https://example.com/cal.ics" },
    ) =>
        ({
            ...createMockCalendar("user-1", { config }),
            user: { id: "user-1", email: "test@example.com" },
        }) as any;

    it("syncs events successfully", async () => {
        mockFetch({});
        mockPrisma.$transaction.mockImplementation(async (fn: any) => {
            await fn({
                event: {
                    createMany: vi.fn().mockResolvedValue({ count: 1 }),
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({}),
                },
            });
        });

        const result = await syncIcsCalendar(makeCalendar());

        expect(result.success).toBe(true);
        expect(result.eventsSynced).toBe(1);
    });

    it("returns error when config has no url", async () => {
        mockPrisma.calendar.update.mockResolvedValue({});

        const result = await syncIcsCalendar(makeCalendar({}));

        expect(result.success).toBe(false);
        expect(result.error).toContain("No ICS URL");
    });

    it("returns error when fetch fails", async () => {
        vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));

        const result = await syncIcsCalendar(makeCalendar());

        expect(result.success).toBe(false);
        expect(result.error).toContain("Network error");
    });

    it("returns error when ICS has no events", async () => {
        mockFetch({}, EMPTY_ICS);
        mockPrisma.calendar.update.mockResolvedValue({});

        vi.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => EMPTY_ICS,
        } as Response);

        const result = await syncIcsCalendar(makeCalendar());

        expect(result.success).toBe(false);
    });

    it("returns database error when transaction fails", async () => {
        mockFetch({});
        mockPrisma.$transaction.mockRejectedValue(new Error("DB error"));

        const result = await syncIcsCalendar(makeCalendar());

        expect(result.success).toBe(false);
        expect(result.error).toContain("Database error");
    });

    it("updates lastSync even when no ICS url", async () => {
        mockPrisma.calendar.update.mockResolvedValue({});

        await syncIcsCalendar(makeCalendar({}));

        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ lastSync: expect.any(Date) }),
            }),
        );
    });
});

describe("testIcsConnection", () => {
    it("returns success with event previews", async () => {
        mockFetch({});

        const result = await testIcsConnection({
            type: "ics",
            config: { url: "https://example.com/cal.ics" },
        });

        expect(result.success).toBe(true);
        expect(result.canConnect).toBe(true);
        expect(result.eventsPreview).toBeDefined();
        expect(Array.isArray(result.eventsPreview)).toBe(true);
    });

    it("returns error for unsupported calendar type", async () => {
        const result = await testIcsConnection({
            type: "google",
            config: { url: "https://example.com/cal.ics" },
        });

        expect(result.success).toBe(false);
        expect(result.canConnect).toBe(false);
        expect(result.error).toContain("Unsupported type");
    });

    it("returns error when no url in config", async () => {
        const result = await testIcsConnection({
            type: "ics",
            config: { url: "" },
        });

        expect(result.success).toBe(false);
        expect(result.canConnect).toBe(false);
    });

    it("returns error when fetch fails", async () => {
        vi.spyOn(global, "fetch").mockRejectedValue(
            new Error("Connection refused"),
        );

        const result = await testIcsConnection({
            type: "ics",
            config: { url: "https://example.com/cal.ics" },
        });

        expect(result.success).toBe(false);
        expect(result.canConnect).toBe(false);
        expect(result.error).toContain("Connection refused");
    });

    it("limits event preview to 5 events", async () => {
        const manyEvents = Array.from(
            { length: 10 },
            (_, i) => `BEGIN:VEVENT
UID:event-${i}@test.com
SUMMARY:Event ${i}
DTSTART:20260301T10000${i}Z
DTEND:20260301T11000${i}Z
END:VEVENT`,
        ).join("\n");

        vi.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            status: 200,
            text: async () =>
                `BEGIN:VCALENDAR\nVERSION:2.0\n${manyEvents}\nEND:VCALENDAR`,
        } as Response);

        const result = await testIcsConnection({
            type: "ics",
            config: { url: "https://example.com/cal.ics" },
        });

        expect(result.eventsPreview?.length).toBeLessThanOrEqual(5);
    });
});
