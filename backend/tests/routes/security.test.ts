import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import {
    createMockUser,
    createMockCalendar,
    createMockFriendship,
} from "../helpers/factories";
import { createAuthHeader } from "../helpers/auth";

describe("Security - Route Authentication", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    describe("Unauthenticated access is rejected (401)", () => {
        const protectedEndpoints = [
            { method: "GET" as const, url: "/api/calendars" },
            {
                method: "PUT" as const,
                url: "/api/calendars/some-id",
                payload: { name: "x" },
            },
            { method: "DELETE" as const, url: "/api/calendars/some-id" },
            { method: "POST" as const, url: "/api/calendars/some-id/sync" },
            { method: "GET" as const, url: "/api/calendars/some-id/test" },
            { method: "GET" as const, url: "/api/events" },
            { method: "GET" as const, url: "/api/events/friends" },
            { method: "GET" as const, url: "/api/friends" },
            {
                method: "POST" as const,
                url: "/api/friends/request",
                payload: { email: "x@x.com" },
            },
            { method: "POST" as const, url: "/api/friends/some-id/accept" },
            { method: "DELETE" as const, url: "/api/friends/some-id" },
            {
                method: "POST" as const,
                url: "/api/friends/share-calendar",
                payload: { friendId: "a", calendarId: "b", share: true },
            },
            { method: "GET" as const, url: "/api/users/me" },
            {
                method: "PUT" as const,
                url: "/api/users/me",
                payload: { name: "x" },
            },
            { method: "GET" as const, url: "/api/users/app-settings" },
            {
                method: "PUT" as const,
                url: "/api/users/app-settings",
                payload: { registrationsOpen: true },
            },
            { method: "POST" as const, url: "/api/users/invite" },
            {
                method: "POST" as const,
                url: "/api/providers/ics/import",
                payload: {},
            },
            { method: "GET" as const, url: "/api/providers/ics/export/cal-1" },
            {
                method: "POST" as const,
                url: "/api/providers/ics/test",
                payload: { url: "https://example.com" },
            },
            {
                method: "GET" as const,
                url: "/api/providers/google/discover?accessToken=x",
            },
            {
                method: "POST" as const,
                url: "/api/providers/caldav/discover",
                payload: { url: "https://example.com" },
            },
            { method: "GET" as const, url: "/api/providers/google/auth-url" },
        ];

        for (const endpoint of protectedEndpoints) {
            it(`${endpoint.method} ${endpoint.url} returns 401 without auth`, async () => {
                const res = await app.inject({
                    method: endpoint.method,
                    url: endpoint.url,
                    ...(endpoint.payload ? { payload: endpoint.payload } : {}),
                });

                expect(res.statusCode).toBe(401);
                const body = JSON.parse(res.body);
                expect(body).toHaveProperty("error");
            });
        }
    });

    describe("Invalid token is rejected (401)", () => {
        it("rejects a completely invalid token", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/calendars",
                headers: { authorization: "Bearer totally-not-a-jwt" },
            });
            expect(res.statusCode).toBe(401);
        });

        it("rejects a token for a non-existent user", async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const res = await app.inject({
                method: "GET",
                url: "/api/calendars",
                headers: createAuthHeader("nonexistent-user-id"),
            });
            expect(res.statusCode).toBe(401);
        });

        it("rejects a malformed Authorization header", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/calendars",
                headers: { authorization: "NotBearer some-token" },
            });
            expect(res.statusCode).toBe(401);
        });
    });

    describe("Public endpoints allow unauthenticated access", () => {
        it("POST /api/users/register is public", async () => {
            mockPrisma.user.count = vi.fn().mockResolvedValue(0);
            mockPrisma.user.findUnique.mockResolvedValue(null);
            mockPrisma.user.create.mockResolvedValue(createMockUser());

            const res = await app.inject({
                method: "POST",
                url: "/api/users/register",
                payload: { email: "new@example.com", password: "pass123" },
            });

            expect(res.statusCode).not.toBe(401);
        });

        it("POST /api/users/login is public", async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const res = await app.inject({
                method: "POST",
                url: "/api/users/login",
                payload: { email: "x@x.com", password: "pass" },
            });

            // 401 here means "invalid credentials", not "no auth token"
            expect(res.statusCode).toBe(401);
            const body = JSON.parse(res.body);
            expect(body.error).toBe("Invalid credentials");
        });

        it("GET /health is public", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/health",
            });
            expect(res.statusCode).toBe(200);
        });
    });
});

describe("Security - Cross-User Isolation", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it("user cannot access another user's calendars", async () => {
        const user1 = createMockUser();
        const user2 = createMockUser();

        // Auth as user2, but calendars belong to user1
        mockPrisma.user.findUnique.mockResolvedValue(user2);
        mockPrisma.calendar.findMany.mockResolvedValue([]);

        const res = await app.inject({
            method: "GET",
            url: "/api/calendars",
            headers: createAuthHeader(user2.id),
        });

        expect(res.statusCode).toBe(200);
        // The service filters by userId, so user2 sees only their own (empty)
        expect(JSON.parse(res.body)).toEqual([]);
    });

    it("user cannot update another user's calendar", async () => {
        const user1 = createMockUser();
        const user2 = createMockUser();
        const calendar = createMockCalendar(user1.id);

        mockPrisma.user.findUnique.mockResolvedValue(user2);
        // findCalendarForUser uses { id, userId } so it returns null for wrong user
        mockPrisma.calendar.findFirst.mockResolvedValue(null);

        const res = await app.inject({
            method: "PUT",
            url: `/api/calendars/${calendar.id}`,
            headers: createAuthHeader(user2.id),
            payload: { name: "Hacked" },
        });

        expect(res.statusCode).toBe(404);
    });

    it("user cannot delete another user's calendar", async () => {
        const user1 = createMockUser();
        const user2 = createMockUser();
        const calendar = createMockCalendar(user1.id);

        mockPrisma.user.findUnique.mockResolvedValue(user2);
        mockPrisma.calendar.findFirst.mockResolvedValue(null);

        const res = await app.inject({
            method: "DELETE",
            url: `/api/calendars/${calendar.id}`,
            headers: createAuthHeader(user2.id),
        });

        expect(res.statusCode).toBe(404);
    });

    it("user cannot sync another user's calendar", async () => {
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

    it("user cannot accept a friend request not addressed to them", async () => {
        const user1 = createMockUser();
        const user2 = createMockUser();
        const user3 = createMockUser();
        const friendship = createMockFriendship(user1.id, user2.id, {
            status: "pending",
        });

        // Auth as user3, who is not user2 (the addressee)
        mockPrisma.user.findUnique.mockResolvedValue(user3);
        mockPrisma.friendship.findFirst.mockResolvedValue(null);

        const res = await app.inject({
            method: "POST",
            url: `/api/friends/${friendship.id}/accept`,
            headers: createAuthHeader(user3.id),
        });

        expect(res.statusCode).toBe(404);
    });

    it("user cannot remove a friendship they are not part of", async () => {
        const user1 = createMockUser();
        const user2 = createMockUser();
        const user3 = createMockUser();
        const friendship = createMockFriendship(user1.id, user2.id);

        mockPrisma.user.findUnique.mockResolvedValue(user3);
        mockPrisma.friendship.findFirst.mockResolvedValue(null);

        const res = await app.inject({
            method: "DELETE",
            url: `/api/friends/${friendship.id}`,
            headers: createAuthHeader(user3.id),
        });

        expect(res.statusCode).toBe(404);
    });

    it("user cannot share a calendar they don't own", async () => {
        const owner = createMockUser();
        const attacker = createMockUser();
        const friend = createMockUser();
        const calendar = createMockCalendar(owner.id);

        mockPrisma.user.findUnique.mockResolvedValue(attacker);
        // Friendship check between attacker and friend
        mockPrisma.friendship.findFirst.mockResolvedValue(
            createMockFriendship(attacker.id, friend.id),
        );
        // Calendar ownership check: attacker doesn't own this calendar
        mockPrisma.calendar.findFirst.mockResolvedValue(null);

        const res = await app.inject({
            method: "POST",
            url: "/api/friends/share-calendar",
            headers: createAuthHeader(attacker.id),
            payload: {
                friendId: friend.id,
                calendarId: calendar.id,
                share: true,
                permission: "full",
            },
        });

        expect(res.statusCode).toBe(404);
        expect(mockPrisma.calendarShare.upsert).not.toHaveBeenCalled();
    });

    it("events query only returns events for the authenticated user's calendars", async () => {
        const user = createMockUser();

        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.event.findMany.mockResolvedValue([]);

        const res = await app.inject({
            method: "GET",
            url: "/api/events",
            headers: createAuthHeader(user.id),
        });

        expect(res.statusCode).toBe(200);
        // Verify the prisma query was scoped to the user
        expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    calendar: { userId: user.id },
                }),
            }),
        );
    });

    it("friend events only returns events shared WITH the authenticated user", async () => {
        const user = createMockUser();

        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.calendarShare.findMany.mockResolvedValue([]);

        const res = await app.inject({
            method: "GET",
            url: "/api/events/friends",
            headers: createAuthHeader(user.id),
        });

        expect(res.statusCode).toBe(200);
        expect(mockPrisma.calendarShare.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { sharedWithId: user.id },
            }),
        );
    });
});

describe("Security - Admin Route Protection", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it("non-admin cannot GET app-settings", async () => {
        const user = createMockUser({ isAdmin: false });
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce(user);

        const res = await app.inject({
            method: "GET",
            url: "/api/users/app-settings",
            headers: createAuthHeader(user.id),
        });

        expect(res.statusCode).toBe(403);
    });

    it("non-admin cannot PUT app-settings", async () => {
        const user = createMockUser({ isAdmin: false });
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce(user);

        const res = await app.inject({
            method: "PUT",
            url: "/api/users/app-settings",
            headers: createAuthHeader(user.id),
            payload: { registrationsOpen: true },
        });

        expect(res.statusCode).toBe(403);
    });

    it("non-admin cannot create invite codes", async () => {
        const user = createMockUser({ isAdmin: false });
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce(user);

        const res = await app.inject({
            method: "POST",
            url: "/api/users/invite",
            headers: createAuthHeader(user.id),
        });

        expect(res.statusCode).toBe(403);
    });

    it("admin CAN access app-settings", async () => {
        const admin = createMockUser({ isAdmin: true });
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(admin)
            .mockResolvedValueOnce(admin);
        mockPrisma.appSettings.upsert.mockResolvedValue({
            id: "global",
            registrationsOpen: true,
            inviteOnly: false,
            updatedAt: new Date(),
        });

        const res = await app.inject({
            method: "GET",
            url: "/api/users/app-settings",
            headers: createAuthHeader(admin.id),
        });

        expect(res.statusCode).toBe(200);
    });
});

describe("Security - Share Permission Enforcement", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it("rejects invalid permission values on share-calendar", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);

        for (const badPerm of [
            "admin",
            "owner",
            "readwrite",
            "FULL",
            "",
            "  ",
        ]) {
            const res = await app.inject({
                method: "POST",
                url: "/api/friends/share-calendar",
                headers: createAuthHeader(user.id),
                payload: {
                    friendId: "friend-id",
                    calendarId: "cal-id",
                    share: true,
                    permission: badPerm,
                },
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body).error).toContain(
                "permission must be one of",
            );
        }
    });

    it("accepts valid permission values on share-calendar", async () => {
        const user = createMockUser();
        const friend = createMockUser();
        const calendar = createMockCalendar(user.id);
        const friendship = createMockFriendship(user.id, friend.id);

        for (const validPerm of ["full", "titles", "busy"]) {
            resetMocks();
            mockPrisma.user.findUnique.mockResolvedValue(user);
            mockPrisma.friendship.findFirst.mockResolvedValue(friendship);
            mockPrisma.calendar.findFirst.mockResolvedValue(calendar);
            mockPrisma.calendarShare.upsert.mockResolvedValue({
                id: "share-id",
                calendarId: calendar.id,
                sharedWithId: friend.id,
                permission: validPerm,
                createdAt: new Date(),
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/friends/share-calendar",
                headers: createAuthHeader(user.id),
                payload: {
                    friendId: friend.id,
                    calendarId: calendar.id,
                    share: true,
                    permission: validPerm,
                },
            });

            expect(res.statusCode).toBe(200);
        }
    });

    it("requires all mandatory fields for share-calendar", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);

        // Missing friendId
        let res = await app.inject({
            method: "POST",
            url: "/api/friends/share-calendar",
            headers: createAuthHeader(user.id),
            payload: { calendarId: "cal", share: true },
        });
        expect(res.statusCode).toBe(400);

        // Missing calendarId
        res = await app.inject({
            method: "POST",
            url: "/api/friends/share-calendar",
            headers: createAuthHeader(user.id),
            payload: { friendId: "f", share: true },
        });
        expect(res.statusCode).toBe(400);

        // Missing share boolean
        res = await app.inject({
            method: "POST",
            url: "/api/friends/share-calendar",
            headers: createAuthHeader(user.id),
            payload: { friendId: "f", calendarId: "cal" },
        });
        expect(res.statusCode).toBe(400);

        // share not boolean
        res = await app.inject({
            method: "POST",
            url: "/api/friends/share-calendar",
            headers: createAuthHeader(user.id),
            payload: { friendId: "f", calendarId: "cal", share: "yes" },
        });
        expect(res.statusCode).toBe(400);
    });

    it("share-calendar requires accepted friendship", async () => {
        const user = createMockUser();
        const stranger = createMockUser();
        const calendar = createMockCalendar(user.id);

        mockPrisma.user.findUnique.mockResolvedValue(user);
        mockPrisma.friendship.findFirst.mockResolvedValue(null);

        const res = await app.inject({
            method: "POST",
            url: "/api/friends/share-calendar",
            headers: createAuthHeader(user.id),
            payload: {
                friendId: stranger.id,
                calendarId: calendar.id,
                share: true,
                permission: "full",
            },
        });

        expect(res.statusCode).toBe(403);
        expect(mockPrisma.calendarShare.upsert).not.toHaveBeenCalled();
    });
});

describe("Security - Google OAuth Callback", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it("redirects with error when code is missing", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/providers/google/callback?state=some-state",
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain("import=error");
        expect(res.headers.location).toContain("reason=invalid-callback");
    });

    it("redirects with error when state is missing", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/providers/google/callback?code=some-code",
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain("import=error");
        expect(res.headers.location).toContain("reason=invalid-callback");
    });

    it("redirects with error when state signature is invalid (forged userId)", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/providers/google/callback?code=valid-code&state=forged-user-id.invalidsignature",
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain("reason=invalid-state");
    });

    it("redirects with error when state is plain userId without signature", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/api/providers/google/callback?code=valid-code&state=plain-user-id",
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toContain("reason=invalid-state");
    });
});

describe("Security - Import Route Auth", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    it("POST /api/providers/:type/import requires authentication", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/api/providers/ics/import",
            payload: { url: "https://evil.com/calendar.ics", name: "Hacked" },
        });

        expect(res.statusCode).toBe(401);
    });

    it("POST /api/providers/:type/import injects authenticated user ID", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);

        // The import will fail since providers are real, but we can verify
        // the auth middleware ran successfully (status != 401)
        const res = await app.inject({
            method: "POST",
            url: "/api/providers/ics/import",
            headers: createAuthHeader(user.id),
            payload: { url: "https://example.com/calendar.ics" },
        });

        // Should not be 401 - auth passed
        expect(res.statusCode).not.toBe(401);
    });
});
