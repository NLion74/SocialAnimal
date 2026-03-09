import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { signOAuthState } from "../../src/utils/auth";

const mocks = vi.hoisted(() => ({
    mockIsGoogleConfigured: vi.fn(),
    mockCreateCalendar: vi.fn(),
}));

vi.mock("../../src/utils/env", () => ({
    env: {
        google: {
            clientId: "test-client-id",
            clientSecret: "test-client-secret",
            redirectUri: "http://localhost:3000/api/providers/google/callback",
            apiUrl: "https://www.googleapis.com/calendar/v3",
        },
    },
    isGoogleConfigured: mocks.mockIsGoogleConfigured,
}));

vi.mock("../../src/services/calendarService", () => ({
    createCalendar: mocks.mockCreateCalendar,
}));

import { GoogleHandler } from "../../src/handlers/providers/google";

describe("GoogleHandler", () => {
    beforeEach(() => {
        resetMocks();
        vi.clearAllMocks();
        mocks.mockIsGoogleConfigured.mockReturnValue(true);
        vi.stubGlobal("fetch", vi.fn());
    });

    it("builds auth url with expected query parameters", async () => {
        const handler = new GoogleHandler();

        const url = await handler.getAuthUrl({ userId: "user-1" });
        const parsed = new URL(url);

        expect(parsed.origin + parsed.pathname).toBe(
            "https://accounts.google.com/o/oauth2/v2/auth",
        );
        expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
        expect(parsed.searchParams.get("state")).toBe(signOAuthState("user-1"));
        expect(parsed.searchParams.get("access_type")).toBe("offline");
    });

    it("throws when Google integration is not configured", async () => {
        const handler = new GoogleHandler();
        mocks.mockIsGoogleConfigured.mockReturnValue(false);

        await expect(handler.getAuthUrl({ userId: "user-1" })).rejects.toThrow(
            "not-configured",
        );
    });

    it("discovers calendars from access token and maps color", async () => {
        const handler = new GoogleHandler();
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                items: [
                    {
                        id: "cal-1",
                        summary: "Work",
                        backgroundColor: "#00AAFF",
                    },
                ],
            }),
        } as any);

        const result = await handler.discover({ accessToken: "token-1" });

        expect(result).toEqual({
            calendars: [{ id: "cal-1", summary: "Work", color: "#00AAFF" }],
        });
    });

    it("discovers calendars from auth code by exchanging tokens", async () => {
        const handler = new GoogleHandler();
        vi.mocked(fetch)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: "new-access",
                    refresh_token: "new-refresh",
                }),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [{ id: "cal-1", summary: "Personal" }],
                }),
            } as any);

        const result = await handler.discover({ code: "oauth-code" });

        expect(result).toEqual({
            accessToken: "new-access",
            refreshToken: "new-refresh",
            calendars: [{ id: "cal-1", summary: "Personal", color: undefined }],
        });
    });

    it("returns validation error when discover params are missing", async () => {
        const handler = new GoogleHandler();

        const result = await handler.discover({});

        expect(result).toEqual({ error: "accessToken or code is required" });
    });

    it("sync returns calendar-not-found when id is unknown", async () => {
        const handler = new GoogleHandler();
        mockPrisma.calendar.findUnique.mockResolvedValue(null);

        const result = await handler.sync("missing-id");

        expect(result).toEqual({
            success: false,
            error: "Calendar not found",
            eventsSynced: 0,
        });
    });

    it("sync refreshes token after unauthorized and stores refreshed config", async () => {
        const handler = new GoogleHandler();

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-1",
            config: {
                accessToken: "expired",
                refreshToken: "refresh-1",
                calendarId: "gcal-1",
            },
            user: { email: "a@example.com" },
        } as any);

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

        vi.mocked(fetch)
            .mockResolvedValueOnce({
                status: 401,
                ok: false,
                json: async () => ({}),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ access_token: "fresh-access" }),
            } as any)
            .mockResolvedValueOnce({
                status: 200,
                ok: true,
                json: async () => ({
                    items: [
                        {
                            id: "evt-1",
                            summary: "Planning",
                            start: { dateTime: "2026-03-03T10:00:00.000Z" },
                            end: { dateTime: "2026-03-03T11:00:00.000Z" },
                        },
                    ],
                }),
            } as any);

        const result = await handler.sync("cal-1");

        expect(result).toEqual({ success: true, eventsSynced: 1 });
        expect(mockPrisma.calendar.update).toHaveBeenCalledWith({
            where: { id: "cal-1" },
            data: {
                config: {
                    accessToken: "fresh-access",
                    refreshToken: "refresh-1",
                    calendarId: "gcal-1",
                },
            },
        });
        expect(txCreateMany).toHaveBeenCalledTimes(1);
    });

    it("sync updates lastSync and returns zero when remote has no events", async () => {
        const handler = new GoogleHandler();

        mockPrisma.calendar.findUnique.mockResolvedValue({
            id: "cal-empty",
            config: {
                accessToken: "token-1",
                refreshToken: "refresh-1",
                calendarId: "gcal-empty",
            },
            user: { email: "a@example.com" },
        } as any);

        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ items: [] }),
        } as any);

        const result = await handler.sync("cal-empty");

        expect(result).toEqual({ success: true, eventsSynced: 0 });
        expect(mockPrisma.calendar.update).toHaveBeenCalledWith({
            where: { id: "cal-empty" },
            data: { lastSync: expect.any(Date) },
        });
    });

    it("returns test failure for invalid config", async () => {
        const handler = new GoogleHandler();

        const result = await handler.test({ accessToken: "token-only" });

        expect(result).toEqual({
            success: false,
            error: "Invalid Google config",
        });
    });

    it("returns test preview for valid config", async () => {
        const handler = new GoogleHandler();

        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                items: [
                    {
                        id: "evt-1",
                        summary: "Daily Standup",
                        start: { dateTime: "2026-03-03T10:00:00.000Z" },
                        end: { dateTime: "2026-03-03T10:30:00.000Z" },
                    },
                    {
                        id: "evt-2",
                        summary: "",
                        start: { dateTime: "2026-03-03T12:00:00.000Z" },
                        end: { dateTime: "2026-03-03T12:30:00.000Z" },
                    },
                ],
            }),
        } as any);

        const result = await handler.test({
            accessToken: "token-1",
            refreshToken: "refresh-1",
            calendarId: "gcal-1",
        });

        expect(result).toEqual({
            success: true,
            eventsPreview: ["Daily Standup"],
        });
    });

    it("returns default test connection error for non-Error throws", async () => {
        const handler = new GoogleHandler();
        vi.mocked(fetch).mockRejectedValueOnce("boom" as any);

        const result = await handler.test({
            accessToken: "token-1",
            refreshToken: "refresh-1",
            calendarId: "gcal-1",
        });

        expect(result).toEqual({
            success: false,
            error: "Failed to connect",
        });
    });

    it("imports existing google calendar by updating config and re-syncing", async () => {
        const handler = new GoogleHandler();

        mockPrisma.calendar.findFirst.mockResolvedValue({ id: "existing-1" });
        mockPrisma.calendar.findUnique.mockResolvedValue({
            config: { existingField: true, accessToken: "old" },
        });

        const syncSpy = vi
            .spyOn(handler, "sync")
            .mockResolvedValue({ success: true, eventsSynced: 3 } as any);

        const result = await handler.import({
            userId: "user-1",
            calendarId: "gcal-1",
            summary: "Updated Name",
            accessToken: "new-token",
            refreshToken: "new-refresh",
            color: "#123456",
        });

        expect(mocks.mockCreateCalendar).not.toHaveBeenCalled();
        expect(mockPrisma.calendar.update).toHaveBeenCalledWith({
            where: { id: "existing-1" },
            data: {
                config: {
                    existingField: true,
                    accessToken: "new-token",
                    refreshToken: "new-refresh",
                    calendarId: "gcal-1",
                    color: "#123456",
                },
                name: "Updated Name",
            },
        });
        expect(syncSpy).toHaveBeenCalledWith("existing-1");
        expect(result).toEqual({ success: true, eventsSynced: 3 });
    });

    it("imports callback mode calendars after exchanging code", async () => {
        const handler = new GoogleHandler();

        vi.mocked(fetch)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: "access-cb",
                    refresh_token: "refresh-cb",
                }),
            } as any)
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [{ id: "cal-1", summary: "Calendar One" }],
                }),
            } as any);

        mockPrisma.calendar.findFirst.mockResolvedValue(null);
        mocks.mockCreateCalendar.mockResolvedValue({ id: "created-1" });

        vi.spyOn(handler, "sync").mockResolvedValue({
            success: true,
            eventsSynced: 2,
        } as any);

        const result = await handler.import({
            mode: "callback",
            state: "user-9",
            code: "oauth-code",
        });

        expect(result).toMatchObject({ count: 1 });
        expect(mocks.mockCreateCalendar).toHaveBeenCalledWith({
            userId: "user-9",
            name: "Calendar One",
            type: "google",
            config: {
                accessToken: "access-cb",
                refreshToken: "refresh-cb",
                calendarId: "cal-1",
                color: undefined,
            },
        });
    });

    it("callback import requires userId/state and code", async () => {
        const handler = new GoogleHandler();

        const resultMissingCode = await handler.import({
            mode: "callback",
            state: "user-1",
        });
        const resultMissingState = await handler.import({
            mode: "callback",
            code: "oauth-code",
        });

        expect(resultMissingCode).toEqual({
            error: "missing userId/state or code",
        });
        expect(resultMissingState).toEqual({
            error: "missing userId/state or code",
        });
    });

    it("returns discover-failed message when discover throws unknown error", async () => {
        const handler = new GoogleHandler();
        vi.mocked(fetch).mockRejectedValueOnce("boom" as any);

        const result = await handler.discover({ accessToken: "token-1" });

        expect(result).toEqual({ error: "discover-failed" });
    });

    it("returns import-failed when import throws unknown error", async () => {
        const handler = new GoogleHandler();
        mockPrisma.calendar.findFirst.mockRejectedValueOnce("boom" as any);

        const result = await handler.import({
            userId: "user-1",
            calendarId: "cal-1",
            accessToken: "token",
            refreshToken: "refresh",
        });

        expect(result).toEqual({ error: "import-failed" });
    });

    it("returns import validation error when required fields are missing", async () => {
        const handler = new GoogleHandler();

        const result = await handler.import({ userId: "user-1" });

        expect(result).toEqual({
            success: false,
            error: "calendarId and userId are required",
            eventsSynced: 0,
        });
    });
});
