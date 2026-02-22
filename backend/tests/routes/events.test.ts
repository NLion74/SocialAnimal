import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import {
    createMockUser,
    createMockCalendar,
    createMockEvent,
} from "../helpers/factories";
import { createAuthHeader } from "../helpers/auth";
import type { FastifyInstance } from "fastify";

describe("Events Routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    describe("GET /api/events", () => {
        it("should return user events", async () => {
            const user = createMockUser();
            const calendar = createMockCalendar(user.id);
            const event1 = createMockEvent(calendar.id, { title: "Meeting" });
            const event2 = createMockEvent(calendar.id, { title: "Lunch" });

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockResolvedValue([calendar]);
            mockPrisma.event.findMany.mockResolvedValue([event1, event2]);

            const res = await app.inject({
                method: "GET",
                url: "/api/events",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.length).toBeGreaterThanOrEqual(2);
            expect(body.some((e: any) => e.title === "Meeting")).toBe(true);
        });

        it("should filter by start date", async () => {
            const user = createMockUser();
            const calendar = createMockCalendar(user.id);
            const future = new Date(Date.now() + 86400000);
            const event = createMockEvent(calendar.id, {
                title: "Future",
                startTime: future,
            });

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockResolvedValue([calendar]);
            mockPrisma.event.findMany.mockResolvedValue([event]);

            const res = await app.inject({
                method: "GET",
                url: `/api/events?start=${future.toISOString()}`,
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.some((e: any) => e.title === "Future")).toBe(true);
        });

        it("should filter by calendarId", async () => {
            const user = createMockUser();
            const calendar1 = createMockCalendar(user.id, { name: "Cal1" });
            const calendar2 = createMockCalendar(user.id, { name: "Cal2" });
            const event1 = createMockEvent(calendar1.id, { title: "Event1" });
            const event2 = createMockEvent(calendar2.id, { title: "Event2" });

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockResolvedValue([calendar1]);
            mockPrisma.event.findMany.mockResolvedValue([event1]);

            const res = await app.inject({
                method: "GET",
                url: `/api/events?calendarId=${calendar1.id}`,
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.every((e: any) => e.calendarId === calendar1.id)).toBe(
                true,
            );
        });

        it("should return empty array when no events", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.calendar.findMany.mockResolvedValue([]);
            mockPrisma.event.findMany.mockResolvedValue([]);

            const res = await app.inject({
                method: "GET",
                url: "/api/events",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual([]);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/events",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("GET /api/events/friends", () => {
        it("should show full event details with 'full' permission", async () => {
            const owner = createMockUser();
            const friend = createMockUser();
            const calendar = createMockCalendar(owner.id);
            const event = createMockEvent(calendar.id, {
                title: "Secret Meeting",
                description: "Confidential details here",
                location: "Room 101",
            });

            mockPrisma.user.findUnique.mockResolvedValue(friend);
            mockPrisma.calendarShare.findMany.mockResolvedValue([
                {
                    id: "share-id",
                    calendarId: calendar.id,
                    sharedWithId: friend.id,
                    permission: "full",
                    createdAt: new Date(),
                    calendar: {
                        ...calendar,
                        user: owner,
                        events: [
                            {
                                ...event,
                                calendar: {
                                    id: calendar.id,
                                    name: calendar.name,
                                    type: calendar.type,
                                },
                            },
                        ],
                    },
                },
            ]);

            const res = await app.inject({
                method: "GET",
                url: "/api/events/friends",
                headers: createAuthHeader(friend.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body[0].title).toBe("Secret Meeting");
            expect(body[0].description).toBe("Confidential details here");
            expect(body[0].location).toBe("Room 101");
        });

        it("should show 'Busy' title only with 'busy' permission", async () => {
            const owner = createMockUser();
            const friend = createMockUser();
            const calendar = createMockCalendar(owner.id);
            const event = createMockEvent(calendar.id, {
                title: "Secret Meeting",
                description: "Confidential details here",
                location: "Room 101",
            });

            mockPrisma.user.findUnique.mockResolvedValue(friend);
            mockPrisma.calendarShare.findMany.mockResolvedValue([
                {
                    id: "share-id",
                    calendarId: calendar.id,
                    sharedWithId: friend.id,
                    permission: "busy",
                    createdAt: new Date(),
                    calendar: {
                        ...calendar,
                        user: owner,
                        events: [
                            {
                                ...event,
                                calendar: {
                                    id: calendar.id,
                                    name: calendar.name,
                                    type: calendar.type,
                                },
                            },
                        ],
                    },
                },
            ]);

            const res = await app.inject({
                method: "GET",
                url: "/api/events/friends",
                headers: createAuthHeader(friend.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body[0].title).toBe("Busy");
            expect(body[0].description).toBeUndefined();
            expect(body[0].location).toBeUndefined();
        });

        it("should show title only with 'titles' permission", async () => {
            const owner = createMockUser();
            const friend = createMockUser();
            const calendar = createMockCalendar(owner.id);
            const event = createMockEvent(calendar.id, {
                title: "Team Standup",
                description: "Daily sync meeting",
                location: "Conference Room A",
            });

            mockPrisma.user.findUnique.mockResolvedValue(friend);
            mockPrisma.calendarShare.findMany.mockResolvedValue([
                {
                    id: "share-id",
                    calendarId: calendar.id,
                    sharedWithId: friend.id,
                    permission: "titles",
                    createdAt: new Date(),
                    calendar: {
                        ...calendar,
                        user: owner,
                        events: [
                            {
                                ...event,
                                calendar: {
                                    id: calendar.id,
                                    name: calendar.name,
                                    type: calendar.type,
                                },
                            },
                        ],
                    },
                },
            ]);

            const res = await app.inject({
                method: "GET",
                url: "/api/events/friends",
                headers: createAuthHeader(friend.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body[0].title).toBe("Team Standup");
            expect(body[0].description).toBeUndefined();
            expect(body[0].location).toBeUndefined();
        });

        it("should preserve time information across all permission levels", async () => {
            const owner = createMockUser();
            const friend = createMockUser();
            const calendar = createMockCalendar(owner.id);
            const startTime = new Date("2026-03-01T10:00:00Z");
            const endTime = new Date("2026-03-01T11:00:00Z");
            const event = createMockEvent(calendar.id, {
                title: "Meeting",
                startTime,
                endTime,
            });

            mockPrisma.user.findUnique.mockResolvedValue(friend);
            mockPrisma.calendarShare.findMany.mockResolvedValue([
                {
                    id: "share-id",
                    calendarId: calendar.id,
                    sharedWithId: friend.id,
                    permission: "busy",
                    createdAt: new Date(),
                    calendar: {
                        ...calendar,
                        user: owner,
                        events: [
                            {
                                ...event,
                                calendar: {
                                    id: calendar.id,
                                    name: calendar.name,
                                    type: calendar.type,
                                },
                            },
                        ],
                    },
                },
            ]);

            const res = await app.inject({
                method: "GET",
                url: "/api/events/friends",
                headers: createAuthHeader(friend.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(new Date(body[0].startTime).getTime()).toBe(
                startTime.getTime(),
            );
            expect(new Date(body[0].endTime).getTime()).toBe(endTime.getTime());
        });

        it("should handle multiple calendars with different permissions", async () => {
            const owner = createMockUser();
            const friend = createMockUser();
            const calendar1 = createMockCalendar(owner.id, { name: "Work" });
            const calendar2 = createMockCalendar(owner.id, {
                name: "Personal",
            });
            const event1 = createMockEvent(calendar1.id, {
                title: "Work Meeting",
                description: "Work stuff",
            });
            const event2 = createMockEvent(calendar2.id, {
                title: "Dentist",
                description: "Personal appointment",
            });

            mockPrisma.user.findUnique.mockResolvedValue(friend);
            mockPrisma.calendarShare.findMany.mockResolvedValue([
                {
                    id: "share-1",
                    calendarId: calendar1.id,
                    sharedWithId: friend.id,
                    permission: "full",
                    createdAt: new Date(),
                    calendar: {
                        ...calendar1,
                        user: owner,
                        events: [
                            {
                                ...event1,
                                calendar: {
                                    id: calendar1.id,
                                    name: calendar1.name,
                                    type: calendar1.type,
                                },
                            },
                        ],
                    },
                },
                {
                    id: "share-2",
                    calendarId: calendar2.id,
                    sharedWithId: friend.id,
                    permission: "busy",
                    createdAt: new Date(),
                    calendar: {
                        ...calendar2,
                        user: owner,
                        events: [
                            {
                                ...event2,
                                calendar: {
                                    id: calendar2.id,
                                    name: calendar2.name,
                                    type: calendar2.type,
                                },
                            },
                        ],
                    },
                },
            ]);

            const res = await app.inject({
                method: "GET",
                url: "/api/events/friends",
                headers: createAuthHeader(friend.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);

            const workEvent = body.find(
                (e: any) => e.calendarId === calendar1.id,
            );
            const personalEvent = body.find(
                (e: any) => e.calendarId === calendar2.id,
            );

            expect(workEvent.title).toBe("Work Meeting");
            expect(workEvent.description).toBe("Work stuff");

            expect(personalEvent.title).toBe("Busy");
            expect(personalEvent.description).toBeUndefined();
        });

        it("should return empty array when no friend events", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.friendship.findMany.mockResolvedValue([]);
            mockPrisma.calendarShare.findMany.mockResolvedValue([]);

            const res = await app.inject({
                method: "GET",
                url: "/api/events/friends",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual([]);

            expect(mockPrisma.calendarShare.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { sharedWithId: user.id },
                }),
            );
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/events/friends",
            });

            expect(res.statusCode).toBe(401);
        });
    });
});
