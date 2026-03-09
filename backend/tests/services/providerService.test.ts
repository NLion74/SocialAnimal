import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";

vi.mock("../../src/handlers/providers/registry", () => ({
    getProviderHandler: vi.fn(),
}));

import {
    handleProviderImport,
    handleProviderAuthUrl,
    handleProviderTest,
    testCalendarConnection,
    handleProviderDiscover,
    handleProviderExport,
    syncCalendar,
    runDueCalendars,
} from "../../src/services/providerService";
import { getProviderHandler } from "../../src/handlers/providers/registry";

describe("providerService", () => {
    beforeEach(() => {
        resetMocks();
        vi.clearAllMocks();
    });

    describe("import/auth-url", () => {
        it("delegates import to provider handler", async () => {
            const importFn = vi.fn().mockResolvedValue({ success: true });
            vi.mocked(getProviderHandler).mockReturnValue({
                import: importFn,
            } as any);

            const payload = { userId: "u1", name: "ICS" };
            const result = await handleProviderImport("ics", payload);

            expect(result).toEqual({ success: true });
            expect(getProviderHandler).toHaveBeenCalledWith("ics");
            expect(importFn).toHaveBeenCalledWith(payload);
        });

        it("returns error when provider import is unsupported", async () => {
            vi.mocked(getProviderHandler).mockReturnValue({} as any);

            const result = await handleProviderImport("unknown", { x: 1 });

            expect(result).toEqual({
                error: "Provider not found or import not supported",
            });
        });

        it("delegates auth-url generation to handler", async () => {
            const getAuthUrl = vi
                .fn()
                .mockResolvedValue("https://auth.example.com");
            vi.mocked(getProviderHandler).mockReturnValue({
                getAuthUrl,
            } as any);

            const result = await handleProviderAuthUrl("google", {
                userId: "u1",
            });

            expect(result).toEqual({ url: "https://auth.example.com" });
            expect(getAuthUrl).toHaveBeenCalledWith({ userId: "u1" });
        });

        it("returns structured error when auth-url capability is missing", async () => {
            vi.mocked(getProviderHandler).mockReturnValue({} as any);

            const result = await handleProviderAuthUrl("ics", { userId: "u1" });

            expect(result).toEqual({
                error: "Provider not found or auth url not supported",
            });
        });

        it("passes through object result from handler getAuthUrl", async () => {
            const getAuthUrl = vi
                .fn()
                .mockResolvedValue({ error: "not-configured" });
            vi.mocked(getProviderHandler).mockReturnValue({
                getAuthUrl,
            } as any);

            const result = await handleProviderAuthUrl("google", {
                userId: "u1",
            });

            expect(result).toEqual({ error: "not-configured" });
        });
    });

    describe("test", () => {
        it("returns error when provider does not support test", async () => {
            vi.mocked(getProviderHandler).mockReturnValue(undefined);

            const result = await handleProviderTest("unknown", {});

            expect(result).toEqual({
                error: "Provider not found or test not supported",
            });
        });

        it("delegates handleProviderTest to provider test", async () => {
            const test = vi.fn().mockResolvedValue({ success: true });
            vi.mocked(getProviderHandler).mockReturnValue({ test } as any);

            const credentials = { token: "abc" };
            const result = await handleProviderTest("google", credentials);

            expect(test).toHaveBeenCalledWith(credentials);
            expect(result).toEqual({ success: true });
        });

        it("returns error when calendar type has no test support", async () => {
            vi.mocked(getProviderHandler).mockReturnValue(undefined);

            const result = await testCalendarConnection(
                { type: "legacy", config: {} },
                "legacy",
            );

            expect(result).toEqual({
                success: false,
                error: "No test for type: legacy",
            });
        });

        it("delegates testCalendarConnection to provider test", async () => {
            const test = vi
                .fn()
                .mockResolvedValue({ success: true, eventsPreview: [] });
            vi.mocked(getProviderHandler).mockReturnValue({ test } as any);

            const calendar = {
                type: "ics",
                config: { url: "https://example.com/a.ics" },
            };
            const result = await testCalendarConnection(calendar, "ics");

            expect(test).toHaveBeenCalledWith(calendar.config);
            expect(result).toEqual({ success: true, eventsPreview: [] });
        });
    });

    describe("discover", () => {
        it("returns error when provider does not support discover", async () => {
            vi.mocked(getProviderHandler).mockReturnValue(undefined);

            const result = await handleProviderDiscover("unknown", {});

            expect(result).toEqual({
                error: "Provider not found or discover not supported",
            });
        });

        it("delegates discover to provider handler", async () => {
            const discover = vi
                .fn()
                .mockResolvedValue({ calendars: [{ id: "1" }] });
            vi.mocked(getProviderHandler).mockReturnValue({ discover } as any);

            const params = { accessToken: "token" };
            const result = await handleProviderDiscover("google", params);

            expect(discover).toHaveBeenCalledWith(params);
            expect(result).toEqual({ calendars: [{ id: "1" }] });
        });
    });

    describe("export", () => {
        it("delegates export to provider handler", async () => {
            const exportFn = vi
                .fn()
                .mockResolvedValue({ body: "BEGIN:VCALENDAR" });
            vi.mocked(getProviderHandler).mockReturnValue({
                export: exportFn,
            } as any);

            const result = await handleProviderExport("ics", {
                calendarId: "cal-1",
                subscription: true,
            });

            expect(result).toEqual({ body: "BEGIN:VCALENDAR" });
            expect(exportFn).toHaveBeenCalledWith({
                calendarId: "cal-1",
                subscription: true,
            });
        });

        it("returns error when export is unsupported", async () => {
            vi.mocked(getProviderHandler).mockReturnValue({} as any);

            const result = await handleProviderExport("google", {
                calendarId: "cal-1",
            });

            expect(result).toEqual({
                error: "Provider not found or export not supported",
            });
        });
    });

    describe("sync", () => {
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
