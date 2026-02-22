import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import {
    createMockUser,
    createMockCalendar,
    createMockFriendship,
} from "../helpers/factories";
import { createAuthHeader } from "../helpers/auth";
import type { FastifyInstance } from "fastify";

describe("Friends Routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    describe("GET /api/friends", () => {
        it("should return user friendships", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser({ email: "friend@example.com" });
            const friendship = createMockFriendship(
                user1.id,
                user2.id,
                "accepted",
            );

            mockPrisma.user.findUnique.mockResolvedValue(user1);
            mockPrisma.friendship.findMany.mockResolvedValue([
                { ...friendship, user1, user2 },
            ]);
            mockPrisma.calendarShare.findMany.mockResolvedValue([]);

            const res = await app.inject({
                method: "GET",
                url: "/api/friends",
                headers: createAuthHeader(user1.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(Array.isArray(body)).toBe(true);
        });

        it("should return empty array when no friends", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.friendship.findMany.mockResolvedValue([]);

            const res = await app.inject({
                method: "GET",
                url: "/api/friends",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual([]);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/friends",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("POST /api/friends/request", () => {
        it("should send friend request", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser({ email: "newfriend@example.com" });

            mockPrisma.user.findUnique
                .mockResolvedValueOnce(user1)
                .mockResolvedValueOnce({ id: user2.id });
            mockPrisma.friendship.findFirst.mockResolvedValue(null);
            mockPrisma.friendship.create.mockResolvedValue({
                id: "friendship-123",
                user1Id: user1.id,
                user2Id: user2.id,
                status: "pending",
                createdAt: new Date(),
                updatedAt: new Date(),
                user2: {
                    id: user2.id,
                    email: user2.email,
                    name: user2.name,
                },
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/request",
                headers: createAuthHeader(user1.id),
                payload: { email: "newfriend@example.com" },
            });

            expect(res.statusCode).toBe(201);
            const body = JSON.parse(res.body);
            expect(body.status).toBe("pending");
            expect(body).toHaveProperty("user2");

            expect(mockPrisma.friendship.create).toHaveBeenCalledWith({
                data: {
                    user1Id: user1.id,
                    user2Id: user2.id,
                    status: "pending",
                },
                include: {
                    user2: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                },
            });
        });

        it("should reject missing email", async () => {
            const user = createMockUser();
            mockPrisma.user.findUnique.mockResolvedValue(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/request",
                headers: createAuthHeader(user.id),
                payload: {},
            });

            expect(res.statusCode).toBe(400);
        });

        it("should reject non-existent user", async () => {
            const user = createMockUser();
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(user)
                .mockResolvedValueOnce(null);

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/request",
                headers: createAuthHeader(user.id),
                payload: { email: "nonexistent@example.com" },
            });

            expect(res.statusCode).toBe(404);
        });

        it("should reject self-friend request", async () => {
            const user = createMockUser({ email: "self@example.com" });
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(user)
                .mockResolvedValueOnce(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/request",
                headers: createAuthHeader(user.id),
                payload: { email: "self@example.com" },
            });

            expect(res.statusCode).toBe(400);
        });

        it("should reject duplicate friend request", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser({ email: "friend@example.com" });
            const existing = createMockFriendship(
                user1.id,
                user2.id,
                "pending",
            );

            mockPrisma.user.findUnique
                .mockResolvedValueOnce(user1)
                .mockResolvedValueOnce(user2);
            mockPrisma.friendship.findFirst.mockResolvedValue(existing);

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/request",
                headers: createAuthHeader(user1.id),
                payload: { email: "friend@example.com" },
            });

            expect(res.statusCode).toBe(400);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/friends/request",
                payload: { email: "test@example.com" },
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("POST /api/friends/:id/accept", () => {
        it("should accept friend request", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();
            const friendship = createMockFriendship(
                user1.id,
                user2.id,
                "pending",
            );
            const accepted = { ...friendship, status: "accepted" };

            mockPrisma.user.findUnique.mockResolvedValue(user2);
            mockPrisma.friendship.findUnique.mockResolvedValue(friendship);
            mockPrisma.friendship.update.mockResolvedValue(accepted);

            const res = await app.inject({
                method: "POST",
                url: `/api/friends/${friendship.id}/accept`,
                headers: createAuthHeader(user2.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.status).toBe("accepted");
        });

        it("should return 404 for non-existent request", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.friendship.findFirst.mockResolvedValue(null);

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/non-existent/accept",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(404);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/friends/some-id/accept",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("DELETE /api/friends/:id", () => {
        it("should remove friendship", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();
            const friendship = createMockFriendship(
                user1.id,
                user2.id,
                "accepted",
            );

            mockPrisma.user.findUnique.mockResolvedValue(user1);
            mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
            mockPrisma.calendarShare.deleteMany.mockResolvedValue({ count: 0 });
            mockPrisma.friendship.delete.mockResolvedValue(friendship);

            const res = await app.inject({
                method: "DELETE",
                url: `/api/friends/${friendship.id}`,
                headers: createAuthHeader(user1.id),
            });

            expect(res.statusCode).toBe(204);
        });

        it("should return 404 for non-existent friendship", async () => {
            const user = createMockUser();

            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.friendship.findFirst.mockResolvedValue(null);

            mockPrisma.friendship.delete.mockResolvedValue(null);
            mockPrisma.calendarShare.deleteMany.mockResolvedValue({ count: 0 });

            const res = await app.inject({
                method: "DELETE",
                url: "/api/friends/non-existent",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(404);
            expect(mockPrisma.friendship.delete).not.toHaveBeenCalled();
            expect(mockPrisma.calendarShare.deleteMany).not.toHaveBeenCalled();
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: "/api/friends/some-id",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("POST /api/friends/share-calendar", () => {
        it("should share calendar with friend", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();
            const friendship = createMockFriendship(
                user1.id,
                user2.id,
                "accepted",
            );
            const calendar = createMockCalendar(user1.id);

            mockPrisma.user.findUnique.mockResolvedValue(user1);
            mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
            mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
            mockPrisma.calendarShare.upsert.mockResolvedValue({
                id: "share-id",
                calendarId: calendar.id,
                sharedWithId: user2.id,
                permission: "full",
                createdAt: new Date(),
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/share-calendar",
                headers: createAuthHeader(user1.id),
                payload: {
                    friendId: user2.id,
                    calendarId: calendar.id,
                    share: true,
                    permission: "full",
                },
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({ ok: true });
        });

        it("should unshare calendar", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();
            const friendship = createMockFriendship(
                user1.id,
                user2.id,
                "accepted",
            );
            const calendar = createMockCalendar(user1.id);

            mockPrisma.user.findUnique.mockResolvedValue(user1);
            mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
            mockPrisma.calendar.findUnique.mockResolvedValue(calendar);
            mockPrisma.calendarShare.delete.mockResolvedValue({
                id: "share-id",
                calendarId: calendar.id,
                sharedWithId: user2.id,
                permission: "full",
                createdAt: new Date(),
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/share-calendar",
                headers: createAuthHeader(user1.id),
                payload: {
                    friendId: user2.id,
                    calendarId: calendar.id,
                    share: false,
                },
            });

            expect(res.statusCode).toBe(200);
        });

        it("should reject share with non-friend", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();
            const calendar = createMockCalendar(user1.id);

            mockPrisma.user.findUnique.mockResolvedValue(user1);
            mockPrisma.friendship.findFirst.mockResolvedValue(null);

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/share-calendar",
                headers: createAuthHeader(user1.id),
                payload: {
                    friendId: user2.id,
                    calendarId: calendar.id,
                    share: true,
                },
            });

            expect(res.statusCode).toBe(403);
        });

        it("should reject share of non-existent calendar", async () => {
            const user1 = createMockUser();
            const user2 = createMockUser();
            const friendship = createMockFriendship(
                user1.id,
                user2.id,
                "accepted",
            );

            mockPrisma.user.findUnique.mockResolvedValue(user1);
            mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
            mockPrisma.calendar.findFirst.mockResolvedValue(null);

            mockPrisma.calendarShare.upsert.mockResolvedValue(null);

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/share-calendar",
                headers: createAuthHeader(user1.id),
                payload: {
                    friendId: user2.id,
                    calendarId: "non-existent",
                    share: true,
                },
            });

            expect(mockPrisma.calendarShare.upsert).not.toHaveBeenCalled();
            expect(res.statusCode).toBe(404);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/friends/share-calendar",
                payload: {
                    friendId: "user-id",
                    calendarId: "calendar-id",
                    share: true,
                },
            });

            expect(res.statusCode).toBe(401);
        });
    });
});
