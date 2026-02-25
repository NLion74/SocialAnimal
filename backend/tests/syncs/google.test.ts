import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { googleSync } from "../../src/syncs/google";
import { createMockCalendar } from "../helpers/factories";

beforeEach(() => resetMocks());
afterEach(() => vi.restoreAllMocks());

const VALID_GOOGLE_CONFIG = {
    accessToken: "valid-access-token",
    refreshToken: "valid-refresh-token",
    calendarId: "primary",
};

const GOOGLE_EVENT_RESPONSE = {
    items: [
        {
            id: "event-1",
            summary: "Test Event",
            description: "Test description",
            location: "Test location",
            start: { dateTime: "2026-03-01T10:00:00Z" },
            end: { dateTime: "2026-03-01T11:00:00Z" },
        },
        {
            id: "event-2",
            summary: "All Day Event",
            start: { date: "2026-03-02" },
            end: { date: "2026-03-03" },
        },
    ],
};

const EMPTY_GOOGLE_RESPONSE = {
    items: [],
};

function mockGoogleFetch(
    response: Partial<Response>,
    body: any = GOOGLE_EVENT_RESPONSE,
) {
    vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => body,
        ...response,
    } as Response);
}

describe("googleSync.syncCalendar", () => {
    const makeCalendar = (config: any = VALID_GOOGLE_CONFIG) =>
        ({
            ...createMockCalendar("user-1", { type: "google", config }),
            user: { id: "user-1", email: "test@example.com" },
        }) as any;

    it("syncs events successfully", async () => {
        mockGoogleFetch({});
        mockPrisma.$transaction.mockImplementation(async (fn: any) => {
            await fn({
                event: {
                    createMany: vi.fn().mockResolvedValue({ count: 2 }),
                    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
                },
                calendar: {
                    update: vi.fn().mockResolvedValue({}),
                },
            });
        });

        const result = await googleSync.syncCalendar(makeCalendar());

        expect(result.success).toBe(true);
        expect(result.eventsSynced).toBe(2);
    });

    it("syncs both timed and all-day events correctly", async () => {
        mockGoogleFetch({});
        let capturedEvents: any[] = [];
        mockPrisma.$transaction.mockImplementation(async (fn: any) => {
            await fn({
                event: {
                    createMany: vi.fn().mockImplementation((args) => {
                        capturedEvents = args.data;
                        return { count: args.data.length };
                    }),
                    deleteMany: vi.fn(),
                },
                calendar: {
                    update: vi.fn(),
                },
            });
        });

        await googleSync.syncCalendar(makeCalendar());

        expect(capturedEvents).toHaveLength(2);
        expect(capturedEvents[0].allDay).toBe(false);
        expect(capturedEvents[1].allDay).toBe(true);
    });

    it("returns error when config is invalid", async () => {
        mockPrisma.calendar.update.mockResolvedValue({});

        const result = await googleSync.syncCalendar(
            makeCalendar({ accessToken: "token" }),
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid Google config");
    });

    it("returns error when fetch fails", async () => {
        vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
        mockPrisma.calendar.update.mockResolvedValue({});

        const result = await googleSync.syncCalendar(makeCalendar());

        expect(result.success).toBe(false);
        expect(result.error).toContain("Network error");
    });

    it("handles empty event list", async () => {
        mockGoogleFetch({}, EMPTY_GOOGLE_RESPONSE);
        mockPrisma.calendar.update.mockResolvedValue({});

        const result = await googleSync.syncCalendar(makeCalendar());

        expect(result.success).toBe(true);
        expect(result.eventsSynced).toBe(0);
    });

    it("refreshes access token on 401 and retries", async () => {
        vi.spyOn(global, "fetch")
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({}),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ access_token: "new-token" }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => GOOGLE_EVENT_RESPONSE,
            } as Response);

        mockPrisma.calendar.update.mockResolvedValue({});
        mockPrisma.$transaction.mockImplementation(async (fn: any) => {
            await fn({
                event: {
                    createMany: vi.fn().mockResolvedValue({ count: 2 }),
                    deleteMany: vi.fn(),
                },
                calendar: {
                    update: vi.fn(),
                },
            });
        });

        const result = await googleSync.syncCalendar(makeCalendar());

        expect(result.success).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    config: expect.objectContaining({
                        accessToken: "new-token",
                    }),
                }),
            }),
        );
    });

    it("returns database error when transaction fails", async () => {
        mockGoogleFetch({});
        mockPrisma.$transaction.mockRejectedValue(new Error("DB error"));

        const result = await googleSync.syncCalendar(makeCalendar());

        expect(result.success).toBe(false);
        expect(result.error).toContain("Database error");
    });

    it("updates lastSync even when fetch fails", async () => {
        vi.spyOn(global, "fetch").mockRejectedValue(new Error("API error"));
        mockPrisma.calendar.update.mockResolvedValue({});

        await googleSync.syncCalendar(makeCalendar());

        expect(mockPrisma.calendar.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ lastSync: expect.any(Date) }),
            }),
        );
    });

    it("handles paginated responses", async () => {
        vi.spyOn(global, "fetch")
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    items: [GOOGLE_EVENT_RESPONSE.items[0]],
                    nextPageToken: "page2",
                }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    items: [GOOGLE_EVENT_RESPONSE.items[1]],
                }),
            } as Response);

        mockPrisma.$transaction.mockImplementation(async (fn: any) => {
            await fn({
                event: {
                    createMany: vi.fn().mockResolvedValue({ count: 2 }),
                    deleteMany: vi.fn(),
                },
                calendar: {
                    update: vi.fn(),
                },
            });
        });

        const result = await googleSync.syncCalendar(makeCalendar());

        expect(result.success).toBe(true);
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(result.eventsSynced).toBe(2);
    });

    it("deletes events not in sync response", async () => {
        mockGoogleFetch({});
        let deletedIds: string[] = [];
        mockPrisma.$transaction.mockImplementation(async (fn: any) => {
            await fn({
                event: {
                    createMany: vi.fn().mockResolvedValue({ count: 2 }),
                    deleteMany: vi.fn().mockImplementation((args) => {
                        deletedIds = args.where.externalId.notIn;
                        return { count: 1 };
                    }),
                },
                calendar: {
                    update: vi.fn(),
                },
            });
        });

        await googleSync.syncCalendar(makeCalendar());

        expect(deletedIds).toEqual(["event-1", "event-2"]);
    });
});

describe("googleSync.testCalendar", () => {
    it("returns success with event previews", async () => {
        mockGoogleFetch({});

        const result = await googleSync.testCalendar({
            type: "google",
            config: VALID_GOOGLE_CONFIG,
        });

        expect(result.success).toBe(true);
        expect(result.eventsPreview).toBeDefined();
        expect(Array.isArray(result.eventsPreview)).toBe(true);
        expect(result.eventsPreview?.length).toBeGreaterThan(0);
    });

    it("returns error for unsupported type", async () => {
        const result = await googleSync.testCalendar({
            type: "ics",
            config: VALID_GOOGLE_CONFIG,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Unsupported type");
    });

    it("returns error for invalid config", async () => {
        const result = await googleSync.testCalendar({
            type: "google",
            config: { accessToken: "token" } as any,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid Google config");
    });

    it("returns error when API call fails", async () => {
        vi.spyOn(global, "fetch").mockRejectedValue(
            new Error("Connection refused"),
        );

        const result = await googleSync.testCalendar({
            type: "google",
            config: VALID_GOOGLE_CONFIG,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Connection refused");
    });

    it("returns error on 401 unauthorized", async () => {
        mockGoogleFetch({ ok: false, status: 401 });

        const result = await googleSync.testCalendar({
            type: "google",
            config: VALID_GOOGLE_CONFIG,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Unauthorized");
    });

    it("limits event preview to 5 events", async () => {
        const manyEvents = Array.from({ length: 10 }, (_, i) => ({
            id: `event-${i}`,
            summary: `Event ${i}`,
            start: { dateTime: `2026-03-0${i + 1}T10:00:00Z` },
            end: { dateTime: `2026-03-0${i + 1}T11:00:00Z` },
        }));

        mockGoogleFetch({}, { items: manyEvents });

        const result = await googleSync.testCalendar({
            type: "google",
            config: VALID_GOOGLE_CONFIG,
        });

        expect(result.eventsPreview?.length).toBeLessThanOrEqual(5);
    });

    it("handles empty event list", async () => {
        mockGoogleFetch({}, EMPTY_GOOGLE_RESPONSE);

        const result = await googleSync.testCalendar({
            type: "google",
            config: VALID_GOOGLE_CONFIG,
        });

        expect(result.success).toBe(true);
        expect(result.eventsPreview).toEqual([]);
    });
});

describe("Google API interaction", () => {
    it("sends correct authorization header", async () => {
        mockGoogleFetch({});

        await googleSync.testCalendar({
            type: "google",
            config: VALID_GOOGLE_CONFIG,
        });

        expect(fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: "Bearer valid-access-token",
                }),
            }),
        );
    });

    it("uses correct calendar ID in API URL", async () => {
        mockGoogleFetch({});

        await googleSync.testCalendar({
            type: "google",
            config: VALID_GOOGLE_CONFIG,
        });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("/calendars/primary/events"),
            expect.any(Object),
        );
    });

    it("requests single events sorted by start time", async () => {
        mockGoogleFetch({});

        await googleSync.testCalendar({
            type: "google",
            config: VALID_GOOGLE_CONFIG,
        });

        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("singleEvents=true"),
            expect.any(Object),
        );
        expect(fetch).toHaveBeenCalledWith(
            expect.stringContaining("orderBy=startTime"),
            expect.any(Object),
        );
    });
});

describe("Token refresh", () => {
    it("refreshes token successfully", async () => {
        vi.spyOn(global, "fetch")
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({}),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ access_token: "new-access-token" }),
            } as Response)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => GOOGLE_EVENT_RESPONSE,
            } as Response);

        mockPrisma.calendar.update.mockResolvedValue({});
        mockPrisma.$transaction.mockImplementation(async (fn: any) => {
            await fn({
                event: {
                    createMany: vi.fn().mockResolvedValue({ count: 2 }),
                    deleteMany: vi.fn(),
                },
                calendar: {
                    update: vi.fn(),
                },
            });
        });

        const calendar = {
            ...createMockCalendar("user-1", {
                type: "google",
                config: VALID_GOOGLE_CONFIG,
            }),
            user: { id: "user-1", email: "test@example.com" },
        } as any;

        const result = await googleSync.syncCalendar(calendar);

        expect(result.success).toBe(true);
        expect(fetch).toHaveBeenNthCalledWith(
            2,
            "https://oauth2.googleapis.com/token",
            expect.objectContaining({
                method: "POST",
            }),
        );
    });

    it("fails when refresh token request fails", async () => {
        vi.spyOn(global, "fetch")
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({}),
            } as Response)
            .mockResolvedValueOnce({
                ok: false,
                status: 400,
                json: async () => ({}),
            } as Response);

        mockPrisma.calendar.update.mockResolvedValue({});

        const calendar = {
            ...createMockCalendar("user-1", {
                type: "google",
                config: VALID_GOOGLE_CONFIG,
            }),
            user: { id: "user-1", email: "test@example.com" },
        } as any;

        const result = await googleSync.syncCalendar(calendar);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Failed to refresh token");
    });
});
