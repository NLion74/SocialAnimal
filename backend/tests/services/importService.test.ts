import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { resetMocks } from "../helpers/prisma";
import { createMockCalendar } from "../helpers/factories";
import * as importService from "../../src/services/importService";
import * as calendarService from "../../src/services/calendarService";
import { syncCalendar, testCalendarConnection } from "../../src/utils/sync";

vi.mock("../../src/services/calendarService");
vi.mock("../../src/utils/sync");

vi.mock("../../src/utils/env", () => {
    const mockIsGoogleConfigured = vi.fn(() => true);
    return {
        env: {
            google: {
                clientId: "test-client-id",
                clientSecret: "test-client-secret",
                redirectUri: "http://localhost:3000/api/import/google/callback",
                apiUrl: "https://www.googleapis.com/calendar/v3",
            },
        },
        isGoogleConfigured: mockIsGoogleConfigured,
    };
});

beforeEach(async () => {
    resetMocks();
    vi.clearAllMocks();
    const { isGoogleConfigured } = vi.mocked(
        await import("../../src/utils/env"),
    );
    vi.mocked(isGoogleConfigured).mockReturnValue(true);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("importIcsCalendar", () => {
    it("should import ICS calendar successfully", async () => {
        const calendar = createMockCalendar("user-1", { type: "ics" });
        const syncResult = { success: true, eventsSynced: 5 };

        vi.mocked(calendarService.createCalendar).mockResolvedValue(calendar);
        vi.mocked(syncCalendar).mockResolvedValue(syncResult);

        const result = await importService.importIcsCalendar({
            userId: "user-1",
            name: "Test Calendar",
            url: "https://example.com/cal.ics",
        });

        expect(result).not.toBe("missing-name");
        expect(result).not.toBe("missing-url");
        if (typeof result !== "string") {
            expect(result.calendar).toEqual(calendar);
            expect(result.sync).toEqual(syncResult);
        }
        expect(calendarService.createCalendar).toHaveBeenCalledWith({
            userId: "user-1",
            name: "Test Calendar",
            type: "ics",
            url: "https://example.com/cal.ics",
            config: undefined,
        });
        expect(syncCalendar).toHaveBeenCalledWith(calendar.id);
    });

    it("should use config.url when url not provided", async () => {
        const calendar = createMockCalendar("user-1", { type: "ics" });
        vi.mocked(calendarService.createCalendar).mockResolvedValue(calendar);
        vi.mocked(syncCalendar).mockResolvedValue({
            success: true,
            eventsSynced: 0,
        });

        await importService.importIcsCalendar({
            userId: "user-1",
            name: "Test",
            config: { url: "https://example.com/cal.ics" },
        });

        expect(calendarService.createCalendar).toHaveBeenCalledWith({
            userId: "user-1",
            name: "Test",
            type: "ics",
            url: undefined,
            config: { url: "https://example.com/cal.ics" },
        });
    });

    it("should return missing-name when name not provided", async () => {
        const result = await importService.importIcsCalendar({
            userId: "user-1",
            name: "",
            url: "https://example.com/cal.ics",
        });

        expect(result).toBe("missing-name");
        expect(calendarService.createCalendar).not.toHaveBeenCalled();
    });

    it("should return missing-url when neither url nor config.url provided", async () => {
        const result = await importService.importIcsCalendar({
            userId: "user-1",
            name: "Test",
        });

        expect(result).toBe("missing-url");
        expect(calendarService.createCalendar).not.toHaveBeenCalled();
    });

    it("should return missing-url when config.url is empty", async () => {
        const result = await importService.importIcsCalendar({
            userId: "user-1",
            name: "Test",
            config: { url: "" },
        });

        expect(result).toBe("missing-url");
    });

    it("should include username and password in config", async () => {
        const calendar = createMockCalendar("user-1");
        vi.mocked(calendarService.createCalendar).mockResolvedValue(calendar);
        vi.mocked(syncCalendar).mockResolvedValue({
            success: true,
            eventsSynced: 0,
        });

        await importService.importIcsCalendar({
            userId: "user-1",
            name: "Test",
            url: "https://example.com/cal.ics",
            config: { username: "user", password: "pass" },
        });

        expect(calendarService.createCalendar).toHaveBeenCalledWith(
            expect.objectContaining({
                config: { username: "user", password: "pass" },
            }),
        );
    });
});

describe("getGoogleAuthUrl", () => {
    it("should generate Google auth URL", async () => {
        const url = await importService.getGoogleAuthUrl("user-123");

        expect(url).not.toBe("not-configured");
        if (typeof url === "string" && url !== "not-configured") {
            expect(url).toContain("accounts.google.com/o/oauth2/v2/auth");
            expect(url).toContain("client_id=test-client-id");
            expect(url).toContain("state=user-123");
            expect(url).toContain("scope=");
            expect(url).toContain("access_type=offline");
            expect(url).toContain("prompt=consent");
        }
    });

    it("should return not-configured when Google not configured", async () => {
        const { isGoogleConfigured } = await import("../../src/utils/env");
        vi.mocked(isGoogleConfigured).mockReturnValue(false);

        const url = await importService.getGoogleAuthUrl("user-123");

        expect(url).toBe("not-configured");
    });
});

describe("exchangeGoogleCode", () => {
    it("should exchange code for tokens", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                access_token: "access-token-123",
                refresh_token: "refresh-token-456",
            }),
        });

        const result = await importService.exchangeGoogleCode("auth-code");

        expect(result).not.toBe("token-exchange-failed");
        if (typeof result !== "string") {
            expect(result.accessToken).toBe("access-token-123");
            expect(result.refreshToken).toBe("refresh-token-456");
        }
        expect(fetch).toHaveBeenCalledWith(
            "https://oauth2.googleapis.com/token",
            expect.objectContaining({
                method: "POST",
            }),
        );
    });

    it("should return token-exchange-failed on HTTP error", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
        });

        const result = await importService.exchangeGoogleCode("bad-code");

        expect(result).toBe("token-exchange-failed");
    });

    it("should return token-exchange-failed when no access_token", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        });

        const result = await importService.exchangeGoogleCode("auth-code");

        expect(result).toBe("token-exchange-failed");
    });

    it("should return token-exchange-failed when Google not configured", async () => {
        const { isGoogleConfigured } = await import("../../src/utils/env");
        vi.mocked(isGoogleConfigured).mockReturnValue(false);

        const result = await importService.exchangeGoogleCode("auth-code");

        expect(result).toBe("token-exchange-failed");
    });
});

describe("fetchGoogleCalendars", () => {
    it("should fetch list of calendars", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                items: [
                    { id: "cal-1", summary: "Work Calendar" },
                    { id: "cal-2", summary: "Personal Calendar" },
                ],
            }),
        });

        const result = await importService.fetchGoogleCalendars("access-token");

        expect(result).not.toBe("calendar-fetch-failed");
        expect(result).not.toBe("no-calendars-found");
        if (Array.isArray(result)) {
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                id: "cal-1",
                summary: "Work Calendar",
            });
            expect(result[1]).toEqual({
                id: "cal-2",
                summary: "Personal Calendar",
            });
        }
    });

    it("should handle calendar without summary", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                items: [{ id: "cal-1" }],
            }),
        });

        const result = await importService.fetchGoogleCalendars("access-token");

        if (Array.isArray(result)) {
            expect(result[0].summary).toBe("Unnamed Calendar");
        }
    });

    it("should return calendar-fetch-failed on HTTP error", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
        });

        const result = await importService.fetchGoogleCalendars("bad-token");

        expect(result).toBe("calendar-fetch-failed");
    });

    it("should return no-calendars-found when items is empty", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ items: [] }),
        });

        const result = await importService.fetchGoogleCalendars("access-token");

        expect(result).toBe("no-calendars-found");
    });

    it("should return no-calendars-found when items is null", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        });

        const result = await importService.fetchGoogleCalendars("access-token");

        expect(result).toBe("no-calendars-found");
    });
});

describe("importGoogleCalendar", () => {
    it("should import Google calendar", async () => {
        const calendar = createMockCalendar("user-1", { type: "google" });
        vi.mocked(calendarService.createCalendar).mockResolvedValue(calendar);
        vi.mocked(syncCalendar).mockResolvedValue({
            success: true,
            eventsSynced: 10,
        });

        const result = await importService.importGoogleCalendar({
            userId: "user-1",
            calendarId: "google-cal-1",
            summary: "Work Calendar",
            accessToken: "access-token",
            refreshToken: "refresh-token",
        });

        expect(result).toEqual(calendar);
        expect(calendarService.createCalendar).toHaveBeenCalledWith({
            userId: "user-1",
            name: "Work Calendar",
            type: "google",
            config: {
                accessToken: "access-token",
                refreshToken: "refresh-token",
                calendarId: "google-cal-1",
            },
        });
        expect(syncCalendar).toHaveBeenCalledWith(calendar.id);
    });

    it("should not fail if initial sync fails", async () => {
        const calendar = createMockCalendar("user-1", { type: "google" });
        vi.mocked(calendarService.createCalendar).mockResolvedValue(calendar);
        vi.mocked(syncCalendar).mockRejectedValue(new Error("Sync failed"));

        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => {});

        const result = await importService.importGoogleCalendar({
            userId: "user-1",
            calendarId: "google-cal-1",
            summary: "Work Calendar",
            accessToken: "access-token",
            refreshToken: "refresh-token",
        });

        expect(result).toEqual(calendar);

        await new Promise((resolve) => setTimeout(resolve, 10));

        consoleErrorSpy.mockRestore();
    });
});

describe("importAllGoogleCalendars", () => {
    it("should import all Google calendars", async () => {
        const calendar1 = createMockCalendar("user-1", { type: "google" });
        const calendar2 = createMockCalendar("user-1", { type: "google" });

        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: "access-token",
                    refresh_token: "refresh-token",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    items: [
                        { id: "cal-1", summary: "Calendar 1" },
                        { id: "cal-2", summary: "Calendar 2" },
                    ],
                }),
            });

        vi.mocked(calendarService.createCalendar)
            .mockResolvedValueOnce(calendar1)
            .mockResolvedValueOnce(calendar2);

        vi.mocked(syncCalendar).mockResolvedValue({
            success: true,
            eventsSynced: 0,
        });

        const result = await importService.importAllGoogleCalendars(
            "user-1",
            "auth-code",
        );

        expect(result).not.toBe("not-configured");
        expect(result).not.toBe("token-exchange-failed");
        if (typeof result !== "string") {
            expect(result.count).toBe(2);
            expect(result.calendars).toHaveLength(2);
        }
    });

    it("should return not-configured when Google not configured", async () => {
        const { isGoogleConfigured } = await import("../../src/utils/env");
        vi.mocked(isGoogleConfigured).mockReturnValue(false);

        const result = await importService.importAllGoogleCalendars(
            "user-1",
            "auth-code",
        );

        expect(result).toBe("not-configured");
    });

    it("should return token-exchange-failed on token exchange error", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
        });

        const result = await importService.importAllGoogleCalendars(
            "user-1",
            "bad-code",
        );

        expect(result).toBe("token-exchange-failed");
    });

    it("should return calendar-fetch-failed on calendar fetch error", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: "access-token",
                    refresh_token: "refresh-token",
                }),
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
            });

        const result = await importService.importAllGoogleCalendars(
            "user-1",
            "auth-code",
        );

        expect(result).toBe("calendar-fetch-failed");
    });

    it("should return no-calendars-found when no calendars", async () => {
        global.fetch = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    access_token: "access-token",
                    refresh_token: "refresh-token",
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ items: [] }),
            });

        const result = await importService.importAllGoogleCalendars(
            "user-1",
            "auth-code",
        );

        expect(result).toBe("no-calendars-found");
    });
});

describe("testImportConnection", () => {
    it("should test ICS connection", async () => {
        const testResult = {
            success: true,
            canConnect: true,
            eventsPreview: ["Event 1", "Event 2"],
        };
        vi.mocked(testCalendarConnection).mockResolvedValue(testResult);

        const result = await importService.testImportConnection("ics", {
            url: "https://example.com/cal.ics",
        });

        expect(result).toEqual(testResult);
        expect(testCalendarConnection).toHaveBeenCalledWith({
            type: "ics",
            config: { url: "https://example.com/cal.ics" },
        });
    });

    it("should test Google connection", async () => {
        const testResult = {
            success: true,
            canConnect: true,
            eventsPreview: ["Event 1"],
        };
        vi.mocked(testCalendarConnection).mockResolvedValue(testResult);

        const result = await importService.testImportConnection("google", {
            accessToken: "token",
            refreshToken: "refresh",
            calendarId: "cal-1",
        });

        expect(result).toEqual(testResult);
    });

    it("should return error result on connection failure", async () => {
        const testResult = {
            success: false,
            canConnect: false,
            error: "Connection failed",
        };
        vi.mocked(testCalendarConnection).mockResolvedValue(testResult);

        const result = await importService.testImportConnection("ics", {
            url: "https://bad-url.com/cal.ics",
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe("Connection failed");
    });
});
