import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { createMockUser } from "../helpers/factories";
import { createAuthHeader } from "../helpers/auth";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { vi } from "vitest";

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
            const body = JSON.parse(res.body);
            expect(body.email).toBe("new@example.com");
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
                payload: {
                    email: "login@example.com",
                    password: "wrongpass",
                },
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
            const body = JSON.parse(res.body);
            expect(body.email).toBe("me@example.com");
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
                .mockResolvedValueOnce(updatedUser);

            mockPrisma.user.update.mockResolvedValue(updatedUser);

            const res = await app.inject({
                method: "PUT",
                url: "/api/users/me",
                headers: createAuthHeader(mockUser.id),
                payload: { name: "New Name" },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.name).toBe("New Name");
        });
    });

    describe("GET /api/users/app-settings", () => {
        it("should return app settings for admin", async () => {
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

        it("should reject non-admin users", async () => {
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
    });

    describe("POST /api/users/invite", () => {
        it("should create invite code for admin", async () => {
            const admin = createMockUser({ isAdmin: true });
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(admin)
                .mockResolvedValueOnce(admin);

            mockPrisma.inviteCode.create.mockResolvedValue({
                id: "invite-id",
                code: "CODE123",
                createdBy: admin.id,
                usedBy: null,
                usedAt: null,
                createdAt: new Date(),
            });

            const res = await app.inject({
                method: "POST",
                url: "/api/users/invite",
                headers: createAuthHeader(admin.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body).toHaveProperty("code");
        });

        it("should reject non-admin users", async () => {
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
    });
});
