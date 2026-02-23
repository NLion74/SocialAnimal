import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { createMockCalendar } from "../helpers/factories";

vi.mock("../../src/syncs/ics", () => ({
    syncIcsCalendar: vi.fn(),
    testIcsConnection: vi.fn(),
}));

import {
    syncCalendar,
    testCalendarConnection,
    runDueCalendars,
} from "../../src/utils/sync";
import { syncIcsCalendar, testIcsConnection } from "../../src/syncs/ics";

beforeEach(() => {
    resetMocks();
    vi.mocked(syncIcsCalendar).mockReset();
    vi.mocked(testIcsConnection).mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("syncCalendar", () => {
    it("returns error when calendar not found", async () => {
        mockPrisma.calendar.findUnique.mockResolvedValue(null);

        const result = await syncCalendar("non-existent");

        expect(result.success).toBe(false);
        expect(result.error).toBe("Calendar not found");
    });

    it("delegates to syncIcsCalendar for ics type", async () => {
        const calendar = createMockCalendar("user-1", {
            type: "ics",
            config: { url: "https://example.com/cal.ics" },
        });
        mockPrisma.calendar.findUnique.mockResolvedValue({
            ...calendar,
            user: { email: "test@example.com" },
        });
        vi.mocked(syncIcsCalendar).mockResolvedValue({
            success: true,
            eventsSynced: 3,
        });

        const result = await syncCalendar(calendar.id);

        expect(syncIcsCalendar).toHaveBeenCalledWith(
            expect.objectContaining({ id: calendar.id }),
        );
        expect(result.success).toBe(true);
        expect(result.eventsSynced).toBe(3);
    });

    it("returns error for unsupported calendar type", async () => {
        const calendar = createMockCalendar("user-1", { type: "google" });
        mockPrisma.calendar.findUnique.mockResolvedValue({
            ...calendar,
            user: { email: "test@example.com" },
        });

        const result = await syncCalendar(calendar.id);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Unsupported type");
        expect(result.error).toContain("google");
    });

    it("catches and returns unexpected errors", async () => {
        const calendar = createMockCalendar("user-1", { type: "ics" });
        mockPrisma.calendar.findUnique.mockResolvedValue({
            ...calendar,
            user: { email: "test@example.com" },
        });
        vi.mocked(syncIcsCalendar).mockRejectedValue(
            new Error("Unexpected crash"),
        );

        const result = await syncCalendar(calendar.id);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Unexpected crash");
    });

    it("returns unknown error for non-Error throws", async () => {
        const calendar = createMockCalendar("user-1", { type: "ics" });
        mockPrisma.calendar.findUnique.mockResolvedValue({
            ...calendar,
            user: { email: "test@example.com" },
        });
        vi.mocked(syncIcsCalendar).mockRejectedValue("string error");

        const result = await syncCalendar(calendar.id);

        expect(result.success).toBe(false);
        expect(result.error).toBe("Unknown error");
    });
});

describe("testCalendarConnection", () => {
    it("delegates to testIcsConnection for ics type with url", async () => {
        vi.mocked(testIcsConnection).mockResolvedValue({
            success: true,
            canConnect: true,
            eventsPreview: ["Event 1"],
        });

        const result = await testCalendarConnection({
            type: "ics",
            config: { url: "https://example.com/cal.ics" },
        });

        expect(testIcsConnection).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "ics",
                config: expect.objectContaining({
                    url: "https://example.com/cal.ics",
                }),
            }),
        );
        expect(result.success).toBe(true);
        expect(result.canConnect).toBe(true);
    });

    it("returns error when ics type has no url", async () => {
        const result = await testCalendarConnection({
            type: "ics",
            config: {},
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("No test for type");
        expect(testIcsConnection).not.toHaveBeenCalled();
    });

    it("returns error for unsupported type", async () => {
        const result = await testCalendarConnection({
            type: "google",
            config: { url: "https://example.com" },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("No test for type: google");
    });

    it("uses type parameter over calendar.type", async () => {
        vi.mocked(testIcsConnection).mockResolvedValue({
            success: true,
            canConnect: true,
        });

        await testCalendarConnection(
            { type: "google", config: { url: "https://example.com/cal.ics" } },
            "ics",
        );

        expect(testIcsConnection).toHaveBeenCalled();
    });
});

describe("runDueCalendars", () => {
    it("syncs calendars that have never been synced", async () => {
        const calendar = createMockCalendar("user-1", { syncInterval: 60 });
        mockPrisma.calendar.findMany.mockResolvedValue([{ id: calendar.id }]);
        mockPrisma.calendar.findUnique.mockResolvedValue({
            ...calendar,
            user: { email: "test@example.com" },
        });
        vi.mocked(syncIcsCalendar).mockResolvedValue({
            success: true,
            eventsSynced: 1,
        });

        await runDueCalendars();

        expect(mockPrisma.calendar.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    syncInterval: { gt: 0 },
                    OR: expect.arrayContaining([
                        { lastSync: null },
                        expect.objectContaining({
                            lastSync: expect.any(Object),
                        }),
                    ]),
                }),
            }),
        );
    });

    it("does not sync manual-only calendars (syncInterval = 0)", async () => {
        mockPrisma.calendar.findMany.mockResolvedValue([]);

        await runDueCalendars();

        expect(syncIcsCalendar).not.toHaveBeenCalled();
    });

    it("runs all due calendars in parallel", async () => {
        const cal1 = createMockCalendar("user-1", { syncInterval: 60 });
        const cal2 = createMockCalendar("user-2", { syncInterval: 60 });
        mockPrisma.calendar.findMany.mockResolvedValue([
            { id: cal1.id },
            { id: cal2.id },
        ]);
        mockPrisma.calendar.findUnique
            .mockResolvedValueOnce({ ...cal1, user: { email: "a@test.com" } })
            .mockResolvedValueOnce({ ...cal2, user: { email: "b@test.com" } });
        vi.mocked(syncIcsCalendar).mockResolvedValue({
            success: true,
            eventsSynced: 0,
        });

        await runDueCalendars();

        expect(mockPrisma.calendar.findUnique).toHaveBeenCalledTimes(2);
    });

    it("continues when one calendar sync fails", async () => {
        const cal1 = createMockCalendar("user-1", { syncInterval: 60 });
        const cal2 = createMockCalendar("user-2", { syncInterval: 60 });
        mockPrisma.calendar.findMany.mockResolvedValue([
            { id: cal1.id },
            { id: cal2.id },
        ]);
        mockPrisma.calendar.findUnique
            .mockResolvedValueOnce({
                ...cal1,
                type: "ics",
                user: { email: "a@test.com" },
            })
            .mockResolvedValueOnce({
                ...cal2,
                type: "ics",
                user: { email: "b@test.com" },
            });
        vi.mocked(syncIcsCalendar)
            .mockRejectedValueOnce(new Error("Sync failed"))
            .mockResolvedValueOnce({ success: true, eventsSynced: 1 });

        await expect(runDueCalendars()).resolves.not.toThrow();
    });
});
