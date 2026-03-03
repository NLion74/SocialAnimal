import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../src/app";
import { mockPrisma, resetMocks } from "../../helpers/prisma";
import { createMockUser } from "../../helpers/factories";
import { createAuthHeader } from "../../helpers/auth";

vi.mock("../../../src/services/importService", () => ({
    handleProviderImport: vi.fn(),
    handleProviderAuthUrl: vi.fn(),
}));

vi.mock("../../../src/services/testService", () => ({
    handleProviderTest: vi.fn(),
}));

vi.mock("../../../src/services/discoverService", () => ({
    handleProviderDiscover: vi.fn(),
}));

import {
    handleProviderImport,
    handleProviderAuthUrl,
} from "../../../src/services/importService";
import { handleProviderDiscover } from "../../../src/services/discoverService";
import { handleProviderTest } from "../../../src/services/testService";
import { signOAuthState } from "../../../src/utils/auth";

describe("Provider Routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
        vi.mocked(handleProviderImport).mockReset();
        vi.mocked(handleProviderAuthUrl).mockReset();
        vi.mocked(handleProviderDiscover).mockReset();
        vi.mocked(handleProviderTest).mockReset();
    });

    afterEach(async () => {
        await app.close();
    });

    it("POST /api/providers/:type/import delegates and returns payload", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        vi.mocked(handleProviderImport).mockResolvedValue({ success: true });

        const res = await app.inject({
            method: "POST",
            url: "/api/providers/ics/import",
            headers: createAuthHeader(user.id),
            payload: { name: "Test" },
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ success: true });
        expect(handleProviderImport).toHaveBeenCalledWith("ics", {
            name: "Test",
            userId: user.id,
        });
    });

    it("POST /api/providers/:type/import returns 404 on unsupported provider", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        vi.mocked(handleProviderImport).mockResolvedValue({ error: "nope" });

        const res = await app.inject({
            method: "POST",
            url: "/api/providers/unknown/import",
            headers: createAuthHeader(user.id),
            payload: { x: 1 },
        });

        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body)).toEqual({
            error: "Provider not found or import not supported",
        });
    });

    it("POST /api/providers/:type/discover delegates to discover service", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        vi.mocked(handleProviderDiscover).mockResolvedValue({
            calendars: [{ url: "https://example.com/cal" }],
        });

        const payload = { url: "https://example.com", username: "u" };
        const res = await app.inject({
            method: "POST",
            url: "/api/providers/caldav/discover",
            headers: createAuthHeader(user.id),
            payload,
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({
            calendars: [{ url: "https://example.com/cal" }],
        });
        expect(handleProviderDiscover).toHaveBeenCalledWith("caldav", payload);
    });

    it("GET /api/providers/:type/discover delegates query params", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        vi.mocked(handleProviderDiscover).mockResolvedValue({ calendars: [] });

        const res = await app.inject({
            method: "GET",
            url: "/api/providers/google/discover?accessToken=abc",
            headers: createAuthHeader(user.id),
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({ calendars: [] });
        expect(handleProviderDiscover).toHaveBeenCalledWith("google", {
            accessToken: "abc",
        });
    });

    it("GET /api/providers/google/auth-url requires auth", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/providers/google/auth-url",
        });

        expect(res.statusCode).toBe(401);
    });

    it("GET /api/providers/google/auth-url returns provider auth url", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        vi.mocked(handleProviderAuthUrl).mockResolvedValue({
            url: "https://accounts.google.com/o/oauth2/v2/auth?...",
        });

        const res = await app.inject({
            method: "GET",
            url: "/api/providers/google/auth-url",
            headers: createAuthHeader(user.id),
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({
            url: "https://accounts.google.com/o/oauth2/v2/auth?...",
        });
        expect(handleProviderAuthUrl).toHaveBeenCalledWith("google", {
            userId: user.id,
        });
    });

    it("GET /api/providers/google/callback redirects to dashboard success", async () => {
        vi.mocked(handleProviderDiscover).mockResolvedValue({
            calendars: [{ id: "cal-1", summary: "Work" }],
            accessToken: "google-access",
            refreshToken: "google-refresh",
        });

        const signedState = signOAuthState("user-1");
        const res = await app.inject({
            method: "GET",
            url: `/api/providers/google/callback?code=abc&state=${encodeURIComponent(signedState)}`,
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain("googleAuthSuccess=success");
        expect(res.headers.location).toContain("googleToken=");
        expect(handleProviderDiscover).toHaveBeenCalledWith("google", {
            code: "abc",
        });
    });

    it("POST /api/providers/:type/test returns 404 on unsupported provider", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        vi.mocked(handleProviderTest).mockResolvedValue({
            error: "Provider not found or test not supported",
        });

        const res = await app.inject({
            method: "POST",
            url: "/api/providers/unknown/test",
            headers: createAuthHeader(user.id),
            payload: { url: "https://example.com" },
        });

        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body)).toEqual({
            error: "Provider not found or test not supported",
        });
    });

    it("POST /api/providers/:type/test returns provider failure payload with 200", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        vi.mocked(handleProviderTest).mockResolvedValue({
            success: false,
            error: "No events found",
        });

        const res = await app.inject({
            method: "POST",
            url: "/api/providers/ics/test",
            headers: createAuthHeader(user.id),
            payload: { url: "https://example.com/calendar.ics" },
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({
            success: false,
            error: "No events found",
        });
    });

    it("POST /api/providers/:type/discover requires authentication", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/providers/caldav/discover",
            payload: { url: "https://example.com" },
        });

        expect(res.statusCode).toBe(401);
    });

    it("GET /api/providers/:type/discover requires authentication", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/providers/google/discover?accessToken=abc",
        });

        expect(res.statusCode).toBe(401);
    });

    it("POST /api/providers/:type/test requires authentication", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/providers/ics/test",
            payload: { url: "https://example.com/calendar.ics" },
        });

        expect(res.statusCode).toBe(401);
    });
});
