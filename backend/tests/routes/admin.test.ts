import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../../src/app";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { createMockUser } from "../helpers/factories";
import { createAuthHeader } from "../helpers/auth";
import type { FastifyInstance } from "fastify";

describe("Admin Routes", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        resetMocks();
        app = await buildApp();
    });

    afterEach(async () => {
        await app.close();
    });

    describe("GET /api/admin/app-settings", () => {
        it("should return app settings for admin", async () => {
            const admin = createMockUser({ isAdmin: true });
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(admin) // authenticateToken
                .mockResolvedValueOnce(admin); // requireAdmin → isAdmin

            mockPrisma.appSettings.upsert.mockResolvedValue({
                id: "global",
                registrationsOpen: true,
                inviteOnly: false,
                updatedAt: new Date(),
            });

            const res = await app.inject({
                method: "GET",
                url: "/api/admin/app-settings",
                headers: createAuthHeader(admin.id),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.registrationsOpen).toBe(true);
            expect(body.inviteOnly).toBe(false);
        });

        it("should reject non-admin users", async () => {
            const user = createMockUser({ isAdmin: false });
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(user)
                .mockResolvedValueOnce(user);

            const res = await app.inject({
                method: "GET",
                url: "/api/admin/app-settings",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(403);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "GET",
                url: "/api/admin/app-settings",
            });

            expect(res.statusCode).toBe(401);
        });
    });

    describe("PUT /api/admin/app-settings", () => {
        it("should update app settings for admin", async () => {
            const admin = createMockUser({ isAdmin: true });
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(admin)
                .mockResolvedValueOnce(admin);

            mockPrisma.appSettings.upsert.mockResolvedValue({
                id: "global",
                registrationsOpen: false,
                inviteOnly: true,
                updatedAt: new Date(),
            });

            const res = await app.inject({
                method: "PUT",
                url: "/api/admin/app-settings",
                headers: createAuthHeader(admin.id),
                payload: { registrationsOpen: false, inviteOnly: true },
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.body);
            expect(body.registrationsOpen).toBe(false);
            expect(body.inviteOnly).toBe(true);
        });

        it("should reject non-admin users", async () => {
            const user = createMockUser({ isAdmin: false });
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(user)
                .mockResolvedValueOnce(user);

            const res = await app.inject({
                method: "PUT",
                url: "/api/admin/app-settings",
                headers: createAuthHeader(user.id),
                payload: { registrationsOpen: true },
            });

            expect(res.statusCode).toBe(403);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "PUT",
                url: "/api/admin/app-settings",
                payload: { registrationsOpen: true },
            });

            expect(res.statusCode).toBe(401);
        });

        it("should return 500 when service throws", async () => {
            const admin = createMockUser({ isAdmin: true });
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(admin)
                .mockResolvedValueOnce(admin);

            mockPrisma.appSettings.upsert.mockRejectedValue(
                new Error("DB crash"),
            );

            const res = await app.inject({
                method: "PUT",
                url: "/api/admin/app-settings",
                headers: createAuthHeader(admin.id),
                payload: { registrationsOpen: true },
            });

            expect(res.statusCode).toBe(500);
        });
    });

    describe("POST /api/admin/invite", () => {
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
                url: "/api/admin/invite",
                headers: createAuthHeader(admin.id),
            });

            expect(res.statusCode).toBe(200);
            expect(JSON.parse(res.body)).toHaveProperty("code");
        });

        it("should reject non-admin users", async () => {
            const user = createMockUser({ isAdmin: false });
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(user)
                .mockResolvedValueOnce(user);

            const res = await app.inject({
                method: "POST",
                url: "/api/admin/invite",
                headers: createAuthHeader(user.id),
            });

            expect(res.statusCode).toBe(403);
        });

        it("should require authentication", async () => {
            const res = await app.inject({
                method: "POST",
                url: "/api/admin/invite",
            });

            expect(res.statusCode).toBe(401);
        });

        it("should return 500 when service throws", async () => {
            const admin = createMockUser({ isAdmin: true });
            mockPrisma.user.findUnique
                .mockResolvedValueOnce(admin)
                .mockResolvedValueOnce(admin);

            mockPrisma.inviteCode.create.mockRejectedValue(
                new Error("DB crash"),
            );

            const res = await app.inject({
                method: "POST",
                url: "/api/admin/invite",
                headers: createAuthHeader(admin.id),
            });

            expect(res.statusCode).toBe(500);
        });
    });
});
