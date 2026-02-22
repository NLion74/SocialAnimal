import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import {
    createMockUser,
    createMockCalendar,
    createMockEvent,
    createMockFriendship,
} from "../helpers/factories";
import { createAuthHeader, createQueryToken } from "../helpers/auth";
import type { FastifyInstance } from "fastify";

describe("ICS Routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    describe("GET /api/ics/my-calendar.ics", () => {
        describe("with query token", () => {
            it("should return ICS file for user", async () => {
                const user = createMockUser();
                const calendar = createMockCalendar(user.id);
                const event = createMockEvent(calendar.id, {
                    title: "Test Event",
                    startTime: new Date("2026-03-01T10:00:00Z"),
                    endTime: new Date("2026-03-01T11:00:00Z"),
                });

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.event.findMany.mockResolvedValue([
                    {
                        ...event,
                        calendar: {
                            id: calendar.id,
                            name: calendar.name,
                            type: calendar.type,
                        },
                    },
                ]);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/my-calendar.ics?token=${createQueryToken(user.id)}`,
                });

                expect(res.statusCode).toBe(200);
                expect(res.headers["content-type"]).toContain("text/calendar");
                expect(res.body).toContain("BEGIN:VCALENDAR");
                expect(res.body).toContain("Test Event");
                expect(res.body).toContain("END:VCALENDAR");
            });

            it("should return empty ICS when no events", async () => {
                const user = createMockUser();

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.event.findMany.mockResolvedValue([]);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/my-calendar.ics?token=${createQueryToken(user.id)}`,
                });

                expect(res.statusCode).toBe(200);
                expect(res.body).toContain("BEGIN:VCALENDAR");
                expect(res.body).toContain("END:VCALENDAR");
                expect(res.body).not.toContain("BEGIN:VEVENT");
            });

            it("should reject invalid token", async () => {
                mockPrisma.user.findUnique.mockResolvedValue(null);

                const res = await app.inject({
                    method: "GET",
                    url: "/api/ics/my-calendar.ics?token=invalid",
                });

                expect(res.statusCode).toBe(401);
            });
        });

        describe("with Bearer token", () => {
            it("should return ICS file for user", async () => {
                const user = createMockUser();
                const calendar = createMockCalendar(user.id);
                const event = createMockEvent(calendar.id, {
                    title: "Test Event",
                });

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.event.findMany.mockResolvedValue([
                    {
                        ...event,
                        calendar: {
                            id: calendar.id,
                            name: calendar.name,
                            type: calendar.type,
                        },
                    },
                ]);

                const res = await app.inject({
                    method: "GET",
                    url: "/api/ics/my-calendar.ics",
                    headers: createAuthHeader(user.id),
                });

                expect(res.statusCode).toBe(200);
                expect(res.body).toContain("Test Event");
            });

            it("should return empty ICS when no events", async () => {
                const user = createMockUser();

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.event.findMany.mockResolvedValue([]);

                const res = await app.inject({
                    method: "GET",
                    url: "/api/ics/my-calendar.ics",
                    headers: createAuthHeader(user.id),
                });

                expect(res.statusCode).toBe(200);
                expect(res.body).toContain("BEGIN:VCALENDAR");
                expect(res.body).not.toContain("BEGIN:VEVENT");
            });
        });

        it("should reject request without token", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/ics/my-calendar.ics",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("GET /api/ics/calendar/:calendarId.ics", () => {
        describe("with query token", () => {
            it("should return ICS file for specific calendar", async () => {
                const user = createMockUser();
                const calendar = createMockCalendar(user.id, { name: "Work" });
                const event = createMockEvent(calendar.id, {
                    title: "Work Meeting",
                });

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
                mockPrisma.event.findMany.mockResolvedValue([event]);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/calendar/${calendar.id}.ics?token=${createQueryToken(user.id)}`,
                });

                expect(res.statusCode).toBe(200);
                expect(res.body).toContain("Work Meeting");
                expect(res.headers["content-disposition"]).toContain(
                    "Work.ics",
                );
            });

            it("should return 404 for non-existent calendar", async () => {
                const user = createMockUser();

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.calendar.findFirst.mockResolvedValue(null);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/calendar/non-existent.ics?token=${createQueryToken(user.id)}`,
                });

                expect(res.statusCode).toBe(404);
            });

            it("should not allow access to other user calendar", async () => {
                const user = createMockUser();
                const otherUser = createMockUser();
                const calendar = createMockCalendar(otherUser.id);

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.calendar.findFirst.mockResolvedValue(null);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/calendar/${calendar.id}.ics?token=${createQueryToken(user.id)}`,
                });

                expect(res.statusCode).toBe(404);
            });
        });

        describe("with Bearer token", () => {
            it("should return ICS file for specific calendar", async () => {
                const user = createMockUser();
                const calendar = createMockCalendar(user.id, {
                    name: "Personal",
                });
                const event = createMockEvent(calendar.id, {
                    title: "Dentist",
                });

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
                mockPrisma.event.findMany.mockResolvedValue([event]);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/calendar/${calendar.id}.ics`,
                    headers: createAuthHeader(user.id),
                });

                expect(res.statusCode).toBe(200);
                expect(res.body).toContain("Dentist");
            });

            it("should return 404 for non-existent calendar", async () => {
                const user = createMockUser();

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.calendar.findFirst.mockResolvedValue(null);

                const res = await app.inject({
                    method: "GET",
                    url: "/api/ics/calendar/non-existent.ics",
                    headers: createAuthHeader(user.id),
                });

                expect(res.statusCode).toBe(404);
            });
        });

        it("should reject request without token", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/ics/calendar/some-id.ics",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("GET /api/ics/friend/:friendUserId.ics", () => {
        describe("with query token", () => {
            it("should return shared friend events", async () => {
                const user = createMockUser();
                const friend = createMockUser({ name: "Friend" });
                const friendship = createMockFriendship(
                    user.id,
                    friend.id,
                    "accepted",
                );
                const calendar = createMockCalendar(friend.id);
                const event = createMockEvent(calendar.id, {
                    title: "Shared Event",
                });

                mockPrisma.user.findUnique
                    .mockResolvedValueOnce(user)
                    .mockResolvedValueOnce(friend);
                mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
                mockPrisma.calendarShare.findMany.mockResolvedValue([
                    {
                        id: "share-id",
                        calendarId: calendar.id,
                        sharedWithId: user.id,
                        permission: "full",
                        createdAt: new Date(),
                    },
                ]);
                mockPrisma.event.findMany.mockResolvedValue([event]);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/friend/${friend.id}.ics?token=${createQueryToken(user.id)}`,
                });

                expect(res.statusCode).toBe(200);
                expect(res.body).toContain("Shared Event");
                expect(res.body).toContain("BEGIN:VCALENDAR");
            });

            it("should return 403 if not friends", async () => {
                const user = createMockUser();
                const other = createMockUser();

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.friendship.findFirst.mockResolvedValue(null);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/friend/${other.id}.ics?token=${createQueryToken(user.id)}`,
                });

                expect(res.statusCode).toBe(403);
            });

            it("should return 403 if no calendars shared", async () => {
                const user = createMockUser();
                const friend = createMockUser();
                const friendship = createMockFriendship(
                    user.id,
                    friend.id,
                    "accepted",
                );

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
                mockPrisma.calendarShare.findMany.mockResolvedValue([]);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/friend/${friend.id}.ics?token=${createQueryToken(user.id)}`,
                });

                expect(res.statusCode).toBe(403);
                expect(res.body).toContain("No calendars shared");
            });

            it("should return 403 for pending friendship", async () => {
                const user = createMockUser();
                const other = createMockUser();
                const friendship = createMockFriendship(
                    user.id,
                    other.id,
                    "pending",
                );

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.friendship.findFirst.mockResolvedValue(friendship);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/friend/${other.id}.ics?token=${createQueryToken(user.id)}`,
                });

                expect(res.statusCode).toBe(403);
            });
        });

        describe("with Bearer token", () => {
            it("should return shared friend events", async () => {
                const user = createMockUser();
                const friend = createMockUser({ name: "Best Friend" });
                const friendship = createMockFriendship(
                    user.id,
                    friend.id,
                    "accepted",
                );
                const calendar = createMockCalendar(friend.id);
                const event = createMockEvent(calendar.id, { title: "Party" });

                mockPrisma.user.findUnique
                    .mockResolvedValueOnce(user)
                    .mockResolvedValueOnce(friend);
                mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
                mockPrisma.calendarShare.findMany.mockResolvedValue([
                    {
                        id: "share-id",
                        calendarId: calendar.id,
                        sharedWithId: user.id,
                        permission: "full",
                        createdAt: new Date(),
                    },
                ]);
                mockPrisma.event.findMany.mockResolvedValue([event]);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/friend/${friend.id}.ics`,
                    headers: createAuthHeader(user.id),
                });

                expect(res.statusCode).toBe(200);
                expect(res.body).toContain("Party");
            });

            it("should return 403 if not friends", async () => {
                const user = createMockUser();
                const other = createMockUser();

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.friendship.findFirst.mockResolvedValue(null);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/friend/${other.id}.ics`,
                    headers: createAuthHeader(user.id),
                });

                expect(res.statusCode).toBe(403);
            });

            it("should return 403 if no calendars shared", async () => {
                const user = createMockUser();
                const friend = createMockUser();
                const friendship = createMockFriendship(
                    user.id,
                    friend.id,
                    "accepted",
                );

                mockPrisma.user.findUnique.mockResolvedValue(user);
                mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
                mockPrisma.calendarShare.findMany.mockResolvedValue([]);

                const res = await app.inject({
                    method: "GET",
                    url: `/api/ics/friend/${friend.id}.ics`,
                    headers: createAuthHeader(user.id),
                });

                expect(res.statusCode).toBe(403);
            });
        });

        it("should reject request without token", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/ics/friend/some-id.ics",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("Token Priority", () => {
        it("should prefer query token over Bearer token", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user1);
            mockPrisma.event.findMany.mockResolvedValue([]);

            const res = await app.inject({
                method: "GET",
                url: `/api/ics/my-calendar.ics?token=${createQueryToken(user1.id)}`,
                headers: createAuthHeader(user2.id),
            });

            expect(res.statusCode).toBe(200);
            expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: user1.id },
                }),
            );
        });
    });
});
