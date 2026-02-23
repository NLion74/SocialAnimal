import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { createMockUser, createMockCalendar } from "../helpers/factories";
import { createAuthHeader } from "../helpers/auth";
import type { FastifyInstance } from "fastify";

describe("Import Routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    describe("POST /api/import/ics", () => {
        it("should create calendar", async () => {
            const user = createMockUser();
            const newCalendar = createMockCalendar(user.id, {
                name: "New Calendar",
            });

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.create.mockResolvedValue(newCalendar);
            mockPrisma.event.findMany.mockResolvedValue([]);

            const res = await app.inject({
                method: "POST",
                url: "/api/calendars",
                headers: createAuthHeader(user.id),
                payload: {
                    name: "New Calendar",
                    type: "ics",
                    url: "https://example.com/cal.ics",
                },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.calendar.name).toBe("New Calendar");
            expect(body.calendar.type).toBe("ics");
            expect(body.calendar.url).toEqual("https://example.com/cal.ics");
            expect(body).toHaveProperty("sync");
        });

        it("should reject missing type", async () => {
            const user = createMockUser();
            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/calendars",
                headers: createAuthHeader(user.id),
                payload: { name: "Test" },
            });

            expect(res.statusCode).toBe(400);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/calendars",
                payload: { name: "Test", type: "ics" },
            });

            expect(res.statusCode).toBe(401);
        });
    });
});
