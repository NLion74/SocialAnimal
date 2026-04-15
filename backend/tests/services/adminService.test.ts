import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import * as adminService from "../../src/services/adminService";

beforeEach(() => resetMocks());

describe("isAdmin", () => {
    it("returns true when user is admin", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: true });
        expect(await adminService.isAdmin("user-1")).toBe(true);
    });

    it("returns false when user is not admin", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });
        expect(await adminService.isAdmin("user-1")).toBe(false);
    });

    it("returns false when user not found", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        expect(await adminService.isAdmin("non-existent")).toBe(false);
    });
});

describe("getOrCreateAppSettings", () => {
    it("returns existing settings", async () => {
        mockPrisma.appSettings.upsert.mockResolvedValue({
            id: "global",
            registrationsOpen: true,
            inviteOnly: false,
            updatedAt: new Date(),
        });

        const result = await adminService.getOrCreateAppSettings();

        expect(result.id).toBe("global");
        expect(result.registrationsOpen).toBe(true);
    });
});

describe("setAppSettings", () => {
    it("updates app settings", async () => {
        mockPrisma.appSettings.upsert.mockResolvedValue({
            id: "global",
            registrationsOpen: false,
            inviteOnly: true,
            updatedAt: new Date(),
        });

        const result = await adminService.setAppSettings({
            registrationsOpen: false,
            inviteOnly: true,
        });

        expect(result.registrationsOpen).toBe(false);
        expect(result.inviteOnly).toBe(true);
    });
});

describe("createInvite", () => {
    it("creates and returns invite code", async () => {
        mockPrisma.inviteCode.create.mockResolvedValue({
            id: "invite-1",
            code: "abc123",
            createdBy: "admin-1",
            usedBy: null,
            usedAt: null,
            createdAt: new Date(),
        });

        const result = await adminService.createInvite("admin-1");

        expect(result.code).toBeDefined();
        expect(mockPrisma.inviteCode.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ createdBy: "admin-1" }),
            }),
        );
    });
});
