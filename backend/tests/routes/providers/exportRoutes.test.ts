import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../../src/app";
import { createAuthHeader } from "../../helpers/auth";
import { createMockUser } from "../../helpers/factories";
import { mockPrisma, resetMocks } from "../../helpers/prisma";
import { generateToken } from "../../../src/utils/auth";

vi.mock("../../../src/services/exportService", () => ({
    handleProviderExport: vi.fn(),
}));

import { handleProviderExport } from "../../../src/services/exportService";

describe("Provider export route", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
        (handleProviderExport as any).mockReset?.();
    });

    afterEach(async () => {
        await app.close();
    });

    it("returns body and mime type for ICS export", async () => {
        const user = createMockUser();
        const token = generateToken(user.id);
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (handleProviderExport as any).mockResolvedValue({
            mimeType: "text/calendar; charset=utf-8",
            body: "BEGIN:VCALENDAR\nEND:VCALENDAR",
        });

        const res = await app.inject({
            method: "GET",
            url: `/api/providers/ics/export/cal-1?token=${encodeURIComponent(token)}`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toContain("text/calendar");
        expect(res.body).toContain("BEGIN:VCALENDAR");
        expect(handleProviderExport).toHaveBeenCalledWith("ics", {
            calendarId: "cal-1",
            subscription: true,
            token,
            userId: user.id,
        });
    });

    it("returns 404 when provider export is unsupported", async () => {
        const user = createMockUser();
        const token = generateToken(user.id);
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (handleProviderExport as any).mockResolvedValue({
            error: "unsupported",
        });

        const res = await app.inject({
            method: "GET",
            url: `/api/providers/unknown/export/cal-1?token=${encodeURIComponent(token)}`,
        });

        expect(res.statusCode).toBe(404);
        expect(JSON.parse(res.body)).toEqual({
            error: "Provider not found or export not supported",
        });
    });

    it("GET /api/providers/:type/export/:calendarId with type=link returns subscription link", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);
        (handleProviderExport as any).mockResolvedValue({
            url: "http://localhost:3000/api/providers/ics/export/cal-1?token=test-token",
        });

        const res = await app.inject({
            method: "GET",
            url: "/api/providers/ics/export/cal-1?type=link",
            headers: createAuthHeader(user.id),
        });

        expect(res.statusCode).toBe(200);
        expect(JSON.parse(res.body)).toEqual({
            url: "http://localhost:3000/api/providers/ics/export/cal-1?token=test-token",
        });
        expect(handleProviderExport).toHaveBeenCalledWith(
            "ics",
            expect.objectContaining({
                type: "link",
                calendarId: "cal-1",
                userId: user.id,
            }),
        );
    });

    it("requires auth for unified export route", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/providers/ics/export/cal-1",
        });

        expect(res.statusCode).toBe(401);
        expect(JSON.parse(res.body)).toEqual({
            error: "No token provided",
        });
    });
});
