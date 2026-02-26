import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { createMockUser } from "../helpers/factories";
import { createAuthHeader } from "../helpers/auth";
import type { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("../../src/services/importService", () => ({
    importIcsCalendar: vi.fn(),
    getGoogleAuthUrl: vi.fn(),
    testImportConnection: vi.fn(),
    exchangeGoogleCode: vi.fn(),
    fetchGoogleCalendars: vi.fn(),
    importGoogleCalendar: vi.fn(),
}));

import {
    importIcsCalendar,
    getGoogleAuthUrl,
    testImportConnection,
    exchangeGoogleCode,
    fetchGoogleCalendars,
    importGoogleCalendar,
} from "../../src/services/importService";

describe("Import Routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
        vi.mocked(importIcsCalendar).mockReset();
        vi.mocked(getGoogleAuthUrl).mockReset();
        vi.mocked(testImportConnection).mockReset();
        vi.mocked(exchangeGoogleCode).mockReset();
        vi.mocked(fetchGoogleCalendars).mockReset();
        vi.mocked(importGoogleCalendar).mockReset();
    });

    afterEach(async () => {
        await app.close();
    });

    describe("POST /api/import/ics", () => {
        it("should create calendar", async () => {
            const user = createMockUser();
            const calendar = {
                id: "cal-1",
                name: "Test Calendar",
                type: "ics",
            };

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(importIcsCalendar).mockResolvedValue(calendar as any);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/ics",
                headers: createAuthHeader(user.id),
                payload: {
                    name: "Test Calendar",
                    url: "https://example.com/cal.ics",
                    config: {},
                },
            });

            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toEqual(calendar);
            expect(importIcsCalendar).toHaveBeenCalledWith({
                userId: user.id,
                name: "Test Calendar",
                url: "https://example.com/cal.ics",
                config: {},
            });
        });

        it("should reject missing name", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(importIcsCalendar).mockResolvedValue("missing-name");

            const res = await app.inject({
                method: "POST",
                url: "/api/import/ics",
                headers: createAuthHeader(user.id),
                payload: {
                    url: "https://example.com/cal.ics",
                },
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body)).toEqual({ error: "Name required" });
        });

        it("should reject missing url", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(importIcsCalendar).mockResolvedValue("missing-url");

            const res = await app.inject({
                method: "POST",
                url: "/api/import/ics",
                headers: createAuthHeader(user.id),
                payload: {
                    name: "Test Calendar",
                },
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body)).toEqual({ error: "URL required" });
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/import/ics",
                payload: {
                    name: "Test",
                    url: "https://example.com/cal.ics",
                },
            });

            expect(res.statusCode).toBe(401);
        });

        it("should handle service errors", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(importIcsCalendar).mockRejectedValue(
                new Error("Service error"),
            );

            const res = await app.inject({
                method: "POST",
                url: "/api/import/ics",
                headers: createAuthHeader(user.id),
                payload: {
                    name: "Test",
                    url: "https://example.com/cal.ics",
                },
            });

            expect(res.statusCode).toBe(500);
            expect(JSON.parse(res.body)).toEqual({
                error: "Failed to import ICS calendar",
            });
        });
    });

    describe("GET /api/import/google/auth-url", () => {
        it("should return auth URL", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(getGoogleAuthUrl).mockResolvedValue(
                "https://accounts.google.com/o/oauth2/auth?...",
            );

            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/auth-url",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({
                url: "https://accounts.google.com/o/oauth2/auth?...",
            });
        });

        it("should return error when not configured", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(getGoogleAuthUrl).mockResolvedValue("not-configured");

            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/auth-url",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(500);
            expect(JSON.parse(res.body)).toEqual({
                error: "Google OAuth not configured",
            });
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/auth-url",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("GET /api/import/google/callback", () => {
        it("should handle successful callback", async () => {
            const user = createMockUser();

            vi.mocked(exchangeGoogleCode).mockResolvedValue({
                accessToken: "access-token",
                refreshToken: "refresh-token",
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/callback",
                query: {
                    code: "auth-code",
                    state: user.id,
                },
            });

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toContain("googleAuthSuccess=success");
            expect(res.headers.location).toContain("googleToken=");
            expect(exchangeGoogleCode).toHaveBeenCalledWith("auth-code");
        });

        it("should redirect on missing code", async () => {
            const user = createMockUser();

            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/callback",
                query: {
                    state: user.id,
                },
            });

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toContain("import=error");
            expect(res.headers.location).toContain("invalid-callback");
        });

        it("should redirect on missing state", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/callback",
                query: {
                    code: "auth-code",
                },
            });

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toContain("import=error");
        });

        it("should redirect on token exchange failure", async () => {
            const user = createMockUser();

            vi.mocked(exchangeGoogleCode).mockResolvedValue(
                "token-exchange-failed",
            );

            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/callback",
                query: {
                    code: "auth-code",
                    state: user.id,
                },
            });

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toContain("token-exchange-failed");
        });

        it("should redirect on unexpected error", async () => {
            const user = createMockUser();

            vi.mocked(exchangeGoogleCode).mockRejectedValue(
                new Error("Unexpected error"),
            );

            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/callback",
                query: {
                    code: "auth-code",
                    state: user.id,
                },
            });

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toContain("googleAuthSuccess=error");
        });
    });

    describe("POST /api/import/google/list", () => {
        it("should list Google calendars", async () => {
            const user = createMockUser();
            const googleToken = jwt.sign(
                {
                    userId: user.id,
                    accessToken: "access-token",
                    refreshToken: "refresh-token",
                },
                process.env.JWT_SECRET!,
                { expiresIn: "15m" },
            );
            const calendars = [
                { id: "cal-1", summary: "Calendar 1" },
                { id: "cal-2", summary: "Calendar 2" },
            ];

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(fetchGoogleCalendars).mockResolvedValue(calendars);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/list",
                headers: createAuthHeader(user.id),
                payload: { token: googleToken },
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ calendars });
            expect(fetchGoogleCalendars).toHaveBeenCalledWith("access-token");
        });

        it("should reject missing token", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/list",
                headers: createAuthHeader(user.id),
                payload: {},
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body)).toEqual({ error: "Token required" });
        });

        it("should reject invalid token", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/list",
                headers: createAuthHeader(user.id),
                payload: { token: "invalid-token" },
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body)).toEqual({
                error: "Invalid or expired token",
            });
        });

        it("should reject token user mismatch", async () => {
            const user = createMockUser();
            const otherUserToken = jwt.sign(
                {
                    userId: "other-user",
                    accessToken: "access-token",
                    refreshToken: "refresh-token",
                },
                process.env.JWT_SECRET!,
            );

            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/list",
                headers: createAuthHeader(user.id),
                payload: { token: otherUserToken },
            });

            expect(res.statusCode).toBe(403);
            expect(JSON.parse(res.body)).toEqual({
                error: "Token user mismatch",
            });
        });

        it("should handle calendar fetch failure", async () => {
            const user = createMockUser();
            const googleToken = jwt.sign(
                {
                    userId: user.id,
                    accessToken: "access-token",
                    refreshToken: "refresh-token",
                },
                process.env.JWT_SECRET!,
            );

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(fetchGoogleCalendars).mockResolvedValue(
                "calendar-fetch-failed",
            );

            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/list",
                headers: createAuthHeader(user.id),
                payload: { token: googleToken },
            });

            expect(res.statusCode).toBe(500);
            expect(JSON.parse(res.body)).toEqual({
                error: "Failed to fetch Google calendars",
            });
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/list",
                payload: { token: "some-token" },
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("GET /api/import/google/imported", () => {
        it("should return imported calendars", async () => {
            const user = createMockUser();
            const calendars = [
                {
                    id: "cal-1",
                    name: "Calendar 1",
                    config: { calendarId: "google-cal-1" },
                    createdAt: new Date(),
                },
                {
                    id: "cal-2",
                    name: "Calendar 2",
                    config: { calendarId: "google-cal-2" },
                    createdAt: new Date(),
                },
            ];

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockResolvedValue(calendars as any);

            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/imported",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.calendars).toHaveLength(2);
            expect(body.importedCalendarIds).toEqual([
                "google-cal-1",
                "google-cal-2",
            ]);
        });

        it("should filter by user and type", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockResolvedValue([]);

            await app.inject({
                method: "GET",
                url: "/api/import/google/imported",
                headers: createAuthHeader(user.id),
            });

            expect(mockPrisma.calendar.findMany).toHaveBeenCalledWith({
                where: {
                    userId: user.id,
                    type: "google",
                },
                select: expect.any(Object),
            });
        });

        it("should handle empty results", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockResolvedValue([]);

            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/imported",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({
                calendars: [],
                importedCalendarIds: [],
            });
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/imported",
            });

            expect(res.statusCode).toBe(401);
        });

        it("should handle database errors", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockRejectedValue(
                new Error("DB error"),
            );

            const res = await app.inject({
                method: "GET",
                url: "/api/import/google/imported",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(500);
            expect(JSON.parse(res.body)).toEqual({
                error: "Failed to get imported calendars",
            });
        });
    });

    describe("POST /api/import/google/import", () => {
        it("should import selected calendars", async () => {
            const user = createMockUser();
            const googleToken = jwt.sign(
                {
                    userId: user.id,
                    accessToken: "access-token",
                    refreshToken: "refresh-token",
                },
                process.env.JWT_SECRET!,
            );
            const allCalendars = [
                { id: "cal-1", summary: "Calendar 1" },
                { id: "cal-2", summary: "Calendar 2" },
            ];

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(fetchGoogleCalendars).mockResolvedValue(allCalendars);
            vi.mocked(importGoogleCalendar)
                .mockResolvedValueOnce({ id: "imported-1" } as any)
                .mockResolvedValueOnce({ id: "imported-2" } as any);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/import",
                headers: createAuthHeader(user.id),
                payload: {
                    token: googleToken,
                    calendarIds: ["cal-1", "cal-2"],
                },
            });

            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body)).toEqual({
                count: 2,
                calendars: [{ id: "imported-1" }, { id: "imported-2" }],
            });
            expect(importGoogleCalendar).toHaveBeenCalledTimes(2);
        });

        it("should reject missing token", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/import",
                headers: createAuthHeader(user.id),
                payload: {
                    calendarIds: ["cal-1"],
                },
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body)).toEqual({
                error: "Token and calendar IDs required",
            });
        });

        it("should reject missing calendarIds", async () => {
            const user = createMockUser();
            const googleToken = jwt.sign(
                { userId: user.id },
                process.env.JWT_SECRET!,
            );

            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/import",
                headers: createAuthHeader(user.id),
                payload: {
                    token: googleToken,
                },
            });

            expect(res.statusCode).toBe(400);
        });

        it("should reject empty calendarIds array", async () => {
            const user = createMockUser();
            const googleToken = jwt.sign(
                { userId: user.id },
                process.env.JWT_SECRET!,
            );

            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/import",
                headers: createAuthHeader(user.id),
                payload: {
                    token: googleToken,
                    calendarIds: [],
                },
            });

            expect(res.statusCode).toBe(400);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/import/google/import",
                payload: {
                    token: "some-token",
                    calendarIds: ["cal-1"],
                },
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("POST /api/import/test-connection", () => {
        it("should test ICS connection successfully", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(testImportConnection).mockResolvedValue({
                success: true,
                canConnect: true,
                eventsPreview: ["Event 1", "Event 2"],
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/import/test-connection",
                headers: createAuthHeader(user.id),
                payload: {
                    type: "ics",
                    config: { url: "https://example.com/cal.ics" },
                },
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({
                success: true,
                canConnect: true,
                eventsPreview: ["Event 1", "Event 2"],
            });
        });

        it("should return 422 on connection failure", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(testImportConnection).mockResolvedValue({
                success: false,
                error: "Connection failed",
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/import/test-connection",
                headers: createAuthHeader(user.id),
                payload: {
                    type: "ics",
                    config: { url: "https://example.com/cal.ics" },
                },
            });

            expect(res.statusCode).toBe(422);
            expect(JSON.parse(res.body)).toEqual({
                error: "Connection failed",
                canConnect: false,
            });
        });

        it("should reject missing type", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/test-connection",
                headers: createAuthHeader(user.id),
                payload: {
                    config: { url: "https://example.com/cal.ics" },
                },
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body)).toEqual({
                error: "Type and config required",
            });
        });

        it("should reject missing config", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/import/test-connection",
                headers: createAuthHeader(user.id),
                payload: {
                    type: "ics",
                },
            });

            expect(res.statusCode).toBe(400);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/import/test-connection",
                payload: {
                    type: "ics",
                    config: { url: "https://example.com/cal.ics" },
                },
            });

            expect(res.statusCode).toBe(401);
        });

        it("should handle service errors", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            vi.mocked(testImportConnection).mockRejectedValue(
                new Error("Service error"),
            );

            const res = await app.inject({
                method: "POST",
                url: "/api/import/test-connection",
                headers: createAuthHeader(user.id),
                payload: {
                    type: "ics",
                    config: { url: "https://example.com/cal.ics" },
                },
            });

            expect(res.statusCode).toBe(500);
            expect(JSON.parse(res.body)).toEqual({ error: "Test failed" });
        });
    });
});
