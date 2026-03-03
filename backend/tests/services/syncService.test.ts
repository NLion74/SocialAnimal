import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";

vi.mock("../../src/handlers/registry", () => ({
    getProviderHandler: vi.fn(),
}));

import { syncCalendar, runDueCalendars } from "../../src/services/syncService";
import { getProviderHandler } from "../../src/handlers/registry";

describe("syncService", () => {
    beforeEach(() => {
        resetMocks();
        vi.clearAllMocks();
    });

    describe("syncCalendar", () => {
        it("returns error when calendar does not exist", async () => {
            mockPrisma.calendar.findUnique.mockResolvedValue(null);

            const result = await syncCalendar("missing");

            expect(result).toEqual({
                success: false,
                error: "Calendar not found",
            });
        });

        it("returns error when provider does not support sync", async () => {
            mockPrisma.calendar.findUnique.mockResolvedValue({
                id: "cal-1",
                type: "ics",
                user: { email: "u@example.com" },
            });
            vi.mocked(getProviderHandler).mockReturnValue({} as any);

            const result = await syncCalendar("cal-1");

            expect(result).toEqual({
                success: false,
                error: "Sync not supported for type: ics",
            });
        });

        it("delegates sync to provider handler", async () => {
            mockPrisma.calendar.findUnique.mockResolvedValue({
                id: "cal-1",
                type: "google",
                user: { email: "u@example.com" },
            });
            const sync = vi.fn().mockResolvedValue({
                success: true,
                eventsSynced: 3,
            });
            vi.mocked(getProviderHandler).mockReturnValue({ sync } as any);

            const result = await syncCalendar("cal-1");

            expect(result).toEqual({ success: true, eventsSynced: 3 });
            expect(sync).toHaveBeenCalledWith("cal-1", "u@example.com");
        });
    });

    describe("runDueCalendars", () => {
        it("syncs all due calendars", async () => {
            mockPrisma.calendar.findMany.mockResolvedValue([
                { id: "cal-1" },
                { id: "cal-2" },
            ]);
            mockPrisma.calendar.findUnique
                .mockResolvedValueOnce({
                    id: "cal-1",
                    type: "ics",
                    user: { email: "a@example.com" },
                })
                .mockResolvedValueOnce({
                    id: "cal-2",
                    type: "google",
                    user: { email: "b@example.com" },
                });

            vi.mocked(getProviderHandler)
                .mockReturnValueOnce({
                    sync: vi
                        .fn()
                        .mockResolvedValue({ success: true, eventsSynced: 1 }),
                } as any)
                .mockReturnValueOnce({
                    sync: vi
                        .fn()
                        .mockResolvedValue({ success: true, eventsSynced: 2 }),
                } as any);

            await runDueCalendars();

            expect(mockPrisma.calendar.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        syncInterval: { gt: 0 },
                    }),
                    select: { id: true },
                }),
            );
        });
    });
});
