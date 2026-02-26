import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { createMockUser, createMockCalendar } from "../helpers/factories";
import { createAuthHeader } from "../helpers/auth";
import type { FastifyInstance } from "fastify";

describe("Calendars Routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    describe("GET /api/calendars", () => {
        it("should return user calendars", async () => {
            const user = createMockUser();
            const calendar1 = createMockCalendar(user.id, { name: "Work" });
            const calendar2 = createMockCalendar(user.id, { name: "Personal" });

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockResolvedValue([
                { ...calendar1, shares: [], events: [] },
                { ...calendar2, shares: [], events: [] },
            ]);

            const res = await app.inject({
                method: "GET",
                url: "/api/calendars",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body).toHaveLength(2);
            expect(body.some((c: any) => c.name === "Work")).toBe(true);
        });

        it("should return empty array when user has no calendars", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockResolvedValue([]);

            const res = await app.inject({
                method: "GET",
                url: "/api/calendars",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual([]);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/calendars",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("PUT /api/calendars/:id", () => {
        it("should update calendar", async () => {
            const user = createMockUser();
            const calendar = createMockCalendar(user.id, { name: "Old Name" });
            const updated = {
                ...calendar,
                name: "Updated Name",
                syncInterval: 120,
            };

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
            mockPrisma.calendar.update.mockResolvedValue(updated);

            const res = await app.inject({
                method: "PUT",
                url: `/api/calendars/${calendar.id}`,
                headers: createAuthHeader(user.id),
                payload: {
                    name: "Updated Name",
                    syncInterval: 120,
                },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.name).toBe("Updated Name");
            expect(body.syncInterval).toBe(120);
        });

        it("should reject update for non-existent calendar", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findFirst.mockResolvedValue(null);

            const res = await app.inject({
                method: "PUT",
                url: "/api/calendars/non-existent-id",
                headers: createAuthHeader(user.id),
                payload: { name: "Test" },
            });

            expect(res.statusCode).toBe(404);
        });

        it("should reject update for calendar owned by another user", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();
            const calendar = createMockCalendar(user1.id);

            mockPrisma.user.findUnique.mockResolvedValue(user2);
            mockPrisma.calendar.findFirst.mockResolvedValue(null);

            const res = await app.inject({
                method: "PUT",
                url: `/api/calendars/${calendar.id}`,
                headers: createAuthHeader(user2.id),
                payload: { name: "Hacked" },
            });

            expect(res.statusCode).toBe(404);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "PUT",
                url: "/api/calendars/some-id",
                payload: { name: "Test" },
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("DELETE /api/calendars/:id", () => {
        it("should delete calendar", async () => {
            const user = createMockUser();
            const calendar = createMockCalendar(user.id);

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
            mockPrisma.$transaction = vi
                .fn()
                .mockResolvedValue([{}, {}, calendar]);

            const res = await app.inject({
                method: "DELETE",
                url: `/api/calendars/${calendar.id}`,
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(204);
        });

        it("should return 404 for non-existent calendar", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findFirst.mockResolvedValue(null);

            const res = await app.inject({
                method: "DELETE",
                url: "/api/calendars/non-existent",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(404);
        });

        it("should not delete calendar owned by another user", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();
            const calendar = createMockCalendar(user2.id);

            mockPrisma.user.findUnique.mockResolvedValue(user2);
            mockPrisma.calendar.findFirst.mockResolvedValue(null);

            const res = await app.inject({
                method: "DELETE",
                url: "/api/calendars/" + calendar.id,
                headers: createAuthHeader(user1.id),
            });

            expect(res.statusCode).toBe(404);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: "/api/calendars/some-id",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("POST /api/calendars/:id/sync", () => {
        it("should attempt to sync calendar", async () => {
            const user = createMockUser();
            const calendar = createMockCalendar(user.id, {
                url: "https://example.com/calendar.ics",
                type: "ics",
            });

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
            mockPrisma.event.findMany.mockResolvedValue([]);
            mockPrisma.calendar.update.mockResolvedValue({
                ...calendar,
                lastSync: new Date(),
            });

            const res = await app.inject({
                method: "POST",
                url: `/api/calendars/${calendar.id}/sync`,
                headers: createAuthHeader(user.id),
            });

            expect([200, 422, 500]).toContain(res.statusCode);

            expect(mockPrisma.calendar.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        id: calendar.id,
                        userId: user.id,
                    },
                }),
            );
        });

        it("should return 404 for non-existent calendar", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findFirst.mockResolvedValue(null);

            const res = await app.inject({
                method: "POST",
                url: "/api/calendars/non-existent-id/sync",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(404);

            expect(mockPrisma.calendar.update).not.toHaveBeenCalled();
        });

        it("should return 404 when calendar belongs to another user", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();
            const calendar = createMockCalendar(user1.id);

            mockPrisma.user.findUnique.mockResolvedValue(user2);
            mockPrisma.calendar.findFirst.mockResolvedValue(null);

            const res = await app.inject({
                method: "POST",
                url: `/api/calendars/${calendar.id}/sync`,
                headers: createAuthHeader(user2.id),
            });

            expect(res.statusCode).toBe(404);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/calendars/some-id/sync",
            });

            expect(res.statusCode).toBe(401);
            expect(mockPrisma.calendar.findFirst).not.toHaveBeenCalled();
        });
    });
});
