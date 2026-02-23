import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "../helpers/prisma";
import { createMockUser } from "../helpers/factories";
import * as usersService from "../../src/services/usersService";
import { hashPassword } from "../../src/utils/auth";

beforeEach(() => resetMocks());

describe("registerUser", () => {
    it("registers first user as admin with no restrictions", async () => {
        const user = createMockUser();
        mockPrisma.user.count.mockResolvedValue(0);
        mockPrisma.user.findUnique.mockResolvedValue(null);
        mockPrisma.user.create.mockResolvedValue({
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: true,
            createdAt: user.createdAt,
        });

        const result = await usersService.registerUser({
            email: user.email,
            password: "password123",
        });

        expect(result).not.toBe("closed");
        expect(result).not.toBe("exists");
        expect(mockPrisma.user.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ isAdmin: true }),
            }),
        );
    });

    it("returns exists when email already taken", async () => {
        const user = createMockUser();
        mockPrisma.user.count.mockResolvedValue(1);
        mockPrisma.appSettings.upsert.mockResolvedValue({
            id: "global",
            registrationsOpen: true,
            inviteOnly: false,
            updatedAt: new Date(),
        });
        mockPrisma.user.findUnique.mockResolvedValue(user);

        const result = await usersService.registerUser({
            email: user.email,
            password: "password123",
        });

        expect(result).toBe("exists");
    });

    it("returns closed when registrations are closed", async () => {
        mockPrisma.user.count.mockResolvedValue(1);
        mockPrisma.appSettings.upsert.mockResolvedValue({
            id: "global",
            registrationsOpen: false,
            inviteOnly: false,
            updatedAt: new Date(),
        });

        const result = await usersService.registerUser({
            email: "new@example.com",
            password: "password123",
        });

        expect(result).toBe("closed");
    });

    it("returns invite-required when invite only and no code provided", async () => {
        mockPrisma.user.count.mockResolvedValue(1);
        mockPrisma.appSettings.upsert.mockResolvedValue({
            id: "global",
            registrationsOpen: true,
            inviteOnly: true,
            updatedAt: new Date(),
        });

        const result = await usersService.registerUser({
            email: "new@example.com",
            password: "password123",
        });

        expect(result).toBe("invite-required");
    });

    it("returns invite-invalid when invite code is invalid", async () => {
        mockPrisma.user.count.mockResolvedValue(1);
        mockPrisma.appSettings.upsert.mockResolvedValue({
            id: "global",
            registrationsOpen: true,
            inviteOnly: true,
            updatedAt: new Date(),
        });
        mockPrisma.inviteCode.findUnique.mockResolvedValue(null);

        const result = await usersService.registerUser({
            email: "new@example.com",
            password: "password123",
            inviteCode: "bad-code",
        });

        expect(result).toBe("invite-invalid");
    });

    it("returns invite-invalid when invite code already used", async () => {
        mockPrisma.user.count.mockResolvedValue(1);
        mockPrisma.appSettings.upsert.mockResolvedValue({
            id: "global",
            registrationsOpen: true,
            inviteOnly: true,
            updatedAt: new Date(),
        });
        mockPrisma.inviteCode.findUnique.mockResolvedValue({
            id: "invite-1",
            code: "used-code",
            usedBy: "someone",
            usedAt: new Date(),
            createdBy: "admin",
            createdAt: new Date(),
        });

        const result = await usersService.registerUser({
            email: "new@example.com",
            password: "password123",
            inviteCode: "used-code",
        });

        expect(result).toBe("invite-invalid");
    });
});

describe("loginUser", () => {
    it("returns user and token on valid credentials", async () => {
        const user = createMockUser({ email: "user@example.com" });
        const { hashPassword } = await import("../../src/utils/auth");
        const { hash, salt } = await hashPassword("password123");

        mockPrisma.user.findUnique.mockResolvedValue({
            ...user,
            passwordHash: hash,
            salt,
        });

        const result = await usersService.loginUser(
            "user@example.com",
            "password123",
        );

        expect(result).not.toBeNull();
        expect(result?.token).toBeDefined();
        expect(result?.user.email).toBe("user@example.com");
    });

    it("returns null when user not found", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        const result = await usersService.loginUser(
            "nobody@example.com",
            "password",
        );
        expect(result).toBeNull();
    });

    it("returns null when password is wrong", async () => {
        const user = createMockUser();
        const { hashPassword } = await import("../../src/utils/auth");
        const { hash, salt } = await hashPassword("correct-password");

        mockPrisma.user.findUnique.mockResolvedValue({
            ...user,
            passwordHash: hash,
            salt,
        });

        const result = await usersService.loginUser(
            user.email,
            "wrong-password",
        );
        expect(result).toBeNull();
    });
});

describe("getMe", () => {
    it("returns user profile with settings", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue({
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            settings: null,
        });

        const result = await usersService.getMe(user.id);

        expect(result?.id).toBe(user.id);
        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: user.id },
            select: {
                id: true,
                email: true,
                name: true,
                isAdmin: true,
                createdAt: true,
                settings: true,
            },
        });
    });

    it("returns null when user not found", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        const result = await usersService.getMe("non-existent");
        expect(result).toBeNull();
    });
});

describe("isAdmin", () => {
    it("returns true when user is admin", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: true });
        const result = await usersService.isAdmin("user-1");
        expect(result).toBe(true);
    });

    it("returns false when user is not admin", async () => {
        mockPrisma.user.findUnique.mockResolvedValue({ isAdmin: false });
        const result = await usersService.isAdmin("user-1");
        expect(result).toBe(false);
    });

    it("returns false when user not found", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);
        const result = await usersService.isAdmin("non-existent");
        expect(result).toBe(false);
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

        const result = await usersService.createInvite("admin-1");

        expect(result.code).toBeDefined();
        expect(mockPrisma.inviteCode.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ createdBy: "admin-1" }),
            }),
        );
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

        const result = await usersService.getOrCreateAppSettings();

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

        const result = await usersService.setAppSettings({
            registrationsOpen: false,
            inviteOnly: true,
        });

        expect(result.registrationsOpen).toBe(false);
        expect(result.inviteOnly).toBe(true);
    });
});

describe("updateMe", () => {
    it("updates name only", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: user.id,
                email: user.email,
                name: "New Name",
                isAdmin: user.isAdmin,
                createdAt: user.createdAt,
                settings: null,
            });
        mockPrisma.user.update.mockResolvedValue({ ...user, name: "New Name" });

        const result = await usersService.updateMe(user.id, {
            name: "New Name",
        });

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: user.id },
                data: { name: "New Name" },
            }),
        );
        expect(result?.name).toBe("New Name");
    });

    it("returns null when user not found", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(null);

        const result = await usersService.updateMe("non-existent", {
            name: "X",
        });

        expect(result).toBeNull();
        expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it("changes password when current password is correct", async () => {
        const { hash, salt } = await hashPassword("current-password");
        const user = createMockUser({ passwordHash: hash, salt });

        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt,
                settings: null,
            });
        mockPrisma.user.update.mockResolvedValue(user);

        await usersService.updateMe(user.id, {
            currentPassword: "current-password",
            newPassword: "new-password",
        });

        expect(mockPrisma.user.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    passwordHash: expect.any(String),
                    salt: expect.any(String),
                }),
            }),
        );
    });

    it("throws when changing password without providing current password", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique.mockResolvedValue(user);

        await expect(
            usersService.updateMe(user.id, { newPassword: "new-password" }),
        ).rejects.toThrow("Current password required");
    });

    it("throws when current password is incorrect", async () => {
        const { hash, salt } = await hashPassword("correct-password");
        const user = createMockUser({ passwordHash: hash, salt });
        mockPrisma.user.findUnique.mockResolvedValue(user);

        await expect(
            usersService.updateMe(user.id, {
                currentPassword: "wrong-password",
                newPassword: "new-password",
            }),
        ).rejects.toThrow("Current password incorrect");
    });

    it("updates defaultSharePermission setting", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt,
                settings: {
                    defaultSharePermission: "busy",
                    firstDayOfWeek: "monday",
                },
            });
        mockPrisma.userSettings.upsert.mockResolvedValue({});

        await usersService.updateMe(user.id, {
            defaultSharePermission: "busy",
        });

        expect(mockPrisma.userSettings.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { userId: user.id },
                update: { defaultSharePermission: "busy" },
                create: expect.objectContaining({
                    defaultSharePermission: "busy",
                }),
            }),
        );
    });

    it("updates firstDayOfWeek setting", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({
                id: user.id,
                email: user.email,
                name: user.name,
                isAdmin: user.isAdmin,
                createdAt: user.createdAt,
                settings: null,
            });
        mockPrisma.userSettings.upsert.mockResolvedValue({});

        await usersService.updateMe(user.id, { firstDayOfWeek: "sunday" });

        expect(mockPrisma.userSettings.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                update: { firstDayOfWeek: "sunday" },
                create: expect.objectContaining({ firstDayOfWeek: "sunday" }),
            }),
        );
    });

    it("does not call userSettings upsert when no settings fields provided", async () => {
        const user = createMockUser();
        mockPrisma.user.findUnique
            .mockResolvedValueOnce(user)
            .mockResolvedValueOnce({ ...user, settings: null });
        mockPrisma.user.update.mockResolvedValue(user);

        await usersService.updateMe(user.id, { name: "Only Name" });

        expect(mockPrisma.userSettings.upsert).not.toHaveBeenCalled();
    });
});
