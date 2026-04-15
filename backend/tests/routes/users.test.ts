import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { createMockUser } from "../helpers/factories";
import { createAuthHeader } from "../helpers/auth";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";

describe("Users Routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    describe("POST /api/users/register", () => {
        it("should register a new user", async () => {
            const mockUser = createMockUser({ email: "new@example.com" });

            mockPrisma.user.count = vi.fn().mockResolvedValue(1);
            mockPrisma.user.findUnique.mockResolvedValue(null);
            mockPrisma.appSettings.upsert.mockResolvedValue({
                id: "global",
                registrationsOpen: true,
                inviteOnly: false,
                updatedAt: new Date(),
            });
            mockPrisma.user.create.mockResolvedValue(mockUser);

            const res = await app.inject({
                method: "POST",
                url: "/api/users/register",
                payload: {
                    email: "new@example.com",
                    password: "password123",
                    name: "New User",
                },
            });

            expect(res.statusCode).toBe(201);
            expect(JSON.parse(res.body).email).toBe("new@example.com");
        });

        it("should reject missing email", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/users/register",
                payload: { password: "pass123" },
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body)).toHaveProperty("error");
        });

        it("should reject missing password", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/users/register",
                payload: { email: "test@example.com" },
            });

            expect(res.statusCode).toBe(400);
        });

        it("should reject duplicate email", async () => {
            const existingUser = createMockUser({
                email: "duplicate@example.com",
            });

            mockPrisma.user.count = vi.fn().mockResolvedValue(1);
            mockPrisma.appSettings.upsert.mockResolvedValue({
                id: "global",
                registrationsOpen: true,
                inviteOnly: false,
                updatedAt: new Date(),
            });
            mockPrisma.user.findUnique.mockResolvedValue(existingUser);

            const res = await app.inject({
                method: "POST",
                url: "/api/users/register",
                payload: {
                    email: "duplicate@example.com",
                    password: "pass123",
                },
            });

            expect(res.statusCode).toBe(400);
        });

        it("should return 403 for invalid invite code", async () => {
            mockPrisma.user.count = vi.fn().mockResolvedValue(1);
            mockPrisma.appSettings.upsert.mockResolvedValue({
                id: "global",
                registrationsOpen: true,
                inviteOnly: true,
                updatedAt: new Date(),
            });
            mockPrisma.user.findUnique.mockResolvedValue(null);
            mockPrisma.inviteCode.findUnique.mockResolvedValue(null);

            const res = await app.inject({
                method: "POST",
                url: "/api/users/register",
                payload: {
                    email: "test@example.com",
                    password: "pass123",
                    inviteCode: "INVALID",
                },
            });

            expect(res.statusCode).toBe(403);
        });

        it("should return 403 when invite code is required but missing", async () => {
            mockPrisma.user.count = vi.fn().mockResolvedValue(1);
            mockPrisma.appSettings.upsert.mockResolvedValue({
                id: "global",
                registrationsOpen: true,
                inviteOnly: true,
                updatedAt: new Date(),
            });
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const res = await app.inject({
                method: "POST",
                url: "/api/users/register",
                payload: { email: "test@example.com", password: "pass123" },
            });

            expect(res.statusCode).toBe(403);
            expect(JSON.parse(res.body).error).toBe("Invite code required");
        });

        it("should return 403 when registrations are closed", async () => {
            mockPrisma.user.count = vi.fn().mockResolvedValue(1);
            mockPrisma.appSettings.upsert.mockResolvedValue({
                id: "global",
                registrationsOpen: false,
                inviteOnly: false,
                updatedAt: new Date(),
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/users/register",
                payload: { email: "test@example.com", password: "pass123" },
            });

            expect(res.statusCode).toBe(403);
            expect(JSON.parse(res.body).error).toBe("Registrations are closed");
        });
    });

    describe("POST /api/users/login", () => {
        it("should login with valid credentials", async () => {
            const salt = "testsalt";
            const password = "correctpass";
            const hash = await bcrypt.hash(password + salt, 4);

            const mockUser = createMockUser({
                email: "login@example.com",
                passwordHash: hash,
                salt,
            });
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);

            const res = await app.inject({
                method: "POST",
                url: "/api/users/login",
                payload: {
                    email: "login@example.com",
                    password: "correctpass",
                },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body).toHaveProperty("token");
            expect(body.user.email).toBe("login@example.com");
        });

        it("should reject invalid password", async () => {
            const salt = "testsalt";
            const hash = await bcrypt.hash("correctpass" + salt, 4);

            const mockUser = createMockUser({
                email: "login@example.com",
                passwordHash: hash,
                salt,
            });
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);

            const res = await app.inject({
                method: "POST",
                url: "/api/users/login",
                payload: { email: "login@example.com", password: "wrongpass" },
            });

            expect(res.statusCode).toBe(401);
        });

        it("should reject non-existent user", async () => {
            mockPrisma.user.findUnique.mockResolvedValue(null);

            const res = await app.inject({
                method: "POST",
                url: "/api/users/login",
                payload: {
                    email: "nonexistent@example.com",
                    password: "pass123",
                },
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("GET /api/users/public-settings", () => {
        it("should return inviteOnly and registrationsOpen", async () => {
            mockPrisma.appSettings.upsert.mockResolvedValue({
                id: "global",
                registrationsOpen: true,
                inviteOnly: false,
                updatedAt: new Date(),
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/users/public-settings",
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toEqual({
                registrationsOpen: true,
                inviteOnly: false,
            });
        });

        it("should return 500 when settings lookup fails", async () => {
            mockPrisma.appSettings.upsert.mockRejectedValue(
                new Error("DB crash"),
            );

            const res = await app.inject({
                method: "GET",
                url: "/api/users/public-settings",
            });

            expect(res.statusCode).toBe(500);
        });
    });

    describe("GET /api/users/me", () => {
        it("should return authenticated user info", async () => {
            const mockUser = createMockUser({ email: "me@example.com" });
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);

            const res = await app.inject({
                method: "GET",
                url: "/api/users/me",
                headers: createAuthHeader(mockUser.id),
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body).email).toBe("me@example.com");
        });

        it("should reject request without token", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/users/me",
            });
            expect(res.statusCode).toBe(401);
        });

        it("should reject invalid token", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/users/me",
                headers: { authorization: "Bearer invalid-token" },
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("PUT /api/users/me", () => {
        it("should update user profile", async () => {
            const mockUser = createMockUser({ name: "Old Name" });
            const updatedUser = { ...mockUser, name: "New Name" };

            mockPrisma.user.findUnique
                .mockResolvedValueOnce(mockUser)
                .mockResolvedValueOnce(mockUser)
                .mockResolvedValueOnce({
                    ...updatedUser,
                    settings: {
                        firstDayOfWeek: "monday",
                        timezone: "Europe/Berlin",
                        defaultTab: "calendar",
                    },
                });

            mockPrisma.user.update.mockResolvedValue(updatedUser);
            mockPrisma.userSettings.upsert.mockResolvedValue({});

            const res = await app.inject({
                method: "PUT",
                url: "/api/users/me",
                headers: createAuthHeader(mockUser.id),
                payload: {
                    name: "New Name",
                    timezone: "Europe/Berlin",
                    defaultTab: "calendar",
                },
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body).name).toBe("New Name");
            expect(mockPrisma.userSettings.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: {
                        timezone: "Europe/Berlin",
                        defaultTab: "calendar",
                    },
                    create: expect.objectContaining({
                        timezone: "Europe/Berlin",
                        defaultTab: "calendar",
                    }),
                }),
            );
        });

        it("should return 400 when current password is missing", async () => {
            const mockUser = createMockUser();
            mockPrisma.user.findUnique.mockResolvedValue(mockUser);

            const res = await app.inject({
                method: "PUT",
                url: "/api/users/me",
                headers: createAuthHeader(mockUser.id),
                payload: { newPassword: "new-password" },
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body).error).toBe(
                "Current password required",
            );
        });

        it("should return 401 for invalid current password", async () => {
            const mockUser = createMockUser();
            const salt = "testsalt";
            const hash = await bcrypt.hash("correct-password" + salt, 4);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...mockUser,
                passwordHash: hash,
                salt,
            });

            const res = await app.inject({
                method: "PUT",
                url: "/api/users/me",
                headers: createAuthHeader(mockUser.id),
                payload: {
                    currentPassword: "wrong-password",
                    newPassword: "new-password",
                },
            });

            expect(res.statusCode).toBe(401);
            const body = JSON.parse(res.body);
            expect(body.error).toBe("Invalid credentials");
            expect(body.code).toBe("INVALID_CREDENTIALS");
        });
    });

    describe("DELETE /api/users/me", () => {
        it("should require authentication", async () => {
            const res = await app.inject({
                method: "DELETE",
                url: "/api/users/me",
            });
            expect(res.statusCode).toBe(401);
        });

        it("should reject request without password", async () => {
            const mockUser = createMockUser();

            const res = await app.inject({
                method: "DELETE",
                url: "/api/users/me",
                headers: createAuthHeader(mockUser.id),
                payload: {},
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body).error).toBe("Password required");
        });

        it("should reject incorrect password", async () => {
            const mockUser = createMockUser();
            const salt = "testsalt";
            const hash = await bcrypt.hash("correct-password" + salt, 4);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...mockUser,
                passwordHash: hash,
                salt,
            });

            const res = await app.inject({
                method: "DELETE",
                url: "/api/users/me",
                headers: createAuthHeader(mockUser.id),
                payload: { password: "wrong-password" },
            });

            expect(res.statusCode).toBe(400);
            expect(JSON.parse(res.body).error).toBe("Password incorrect");
        });

        it("should delete account with correct password", async () => {
            const mockUser = createMockUser();
            const salt = "testsalt";
            const hash = await bcrypt.hash("correct-password" + salt, 4);
            mockPrisma.user.findUnique.mockResolvedValue({
                ...mockUser,
                passwordHash: hash,
                salt,
            });

            const res = await app.inject({
                method: "DELETE",
                url: "/api/users/me",
                headers: createAuthHeader(mockUser.id),
                payload: { password: "correct-password" },
            });

            expect(res.statusCode).toBe(204);
            expect(mockPrisma.$transaction).toHaveBeenCalled();
        });
    });
});
