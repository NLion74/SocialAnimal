import { prisma } from "../utils/db";
import { hashPassword, verifyPassword, generateToken } from "../utils/auth";
import crypto from "crypto";

export async function registerUser(opts: {
    email: string;
    password: string;
    name?: string;
    inviteCode?: string;
}) {
    const { email, password, name, inviteCode } = opts;

    const isFirstUser = (await prisma.user.count()) === 0;
    if (!isFirstUser) {
        const settings = await getOrCreateAppSettings();
        if (!settings.registrationsOpen) return "closed";
        if (settings.inviteOnly) {
            if (!inviteCode) return "invite-required";
            const invite = await prisma.inviteCode.findUnique({
                where: { code: inviteCode },
            });
            if (!invite || invite.usedBy) return "invite-invalid";
            await prisma.inviteCode.update({
                where: { code: inviteCode },
                data: { usedBy: "pending", usedAt: new Date() },
            });
        }
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return "exists";

    const { hash, salt } = await hashPassword(password);
    const user = await prisma.user.create({
        data: {
            email,
            passwordHash: hash,
            salt,
            name,
            isAdmin: isFirstUser,
        },
        select: {
            id: true,
            email: true,
            name: true,
            isAdmin: true,
            createdAt: true,
        },
    });

    return user;
}

export async function loginUser(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const valid = await verifyPassword(password, user.passwordHash, user.salt);
    if (!valid) return null;

    return {
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin,
        },
        token: generateToken(user.id),
    };
}

export async function getMe(userId: string) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            name: true,
            isAdmin: true,
            createdAt: true,
            settings: true,
        },
    });
}

export async function updateMe(userId: string, payload: any) {
    const {
        name,
        currentPassword,
        newPassword,
        defaultSharePermission,
        firstDayOfWeek,
    } = payload;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;

    if (newPassword) {
        if (!currentPassword) throw new Error("Current password required");
        const valid = await verifyPassword(
            currentPassword,
            user.passwordHash,
            user.salt,
        );
        if (!valid) throw new Error("Current password incorrect");
        const { hash, salt } = await hashPassword(newPassword);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: hash, salt },
        });
    }

    if (name !== undefined)
        await prisma.user.update({ where: { id: userId }, data: { name } });

    if (defaultSharePermission !== undefined || firstDayOfWeek !== undefined) {
        await prisma.userSettings.upsert({
            where: { userId },
            update: {
                ...(defaultSharePermission !== undefined
                    ? { defaultSharePermission }
                    : {}),
                ...(firstDayOfWeek !== undefined ? { firstDayOfWeek } : {}),
            },
            create: {
                userId,
                defaultSharePermission: defaultSharePermission ?? "full",
                firstDayOfWeek: firstDayOfWeek ?? "monday",
            },
        });
    }

    return getMe(userId);
}

export async function getOrCreateAppSettings() {
    return prisma.appSettings.upsert({
        where: { id: "global" },
        update: {},
        create: { id: "global", registrationsOpen: true, inviteOnly: false },
    });
}

export async function isAdmin(userId: string) {
    const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true },
    });
    return !!u?.isAdmin;
}

export async function setAppSettings(opts: {
    registrationsOpen?: boolean;
    inviteOnly?: boolean;
}) {
    return prisma.appSettings.upsert({
        where: { id: "global" },
        update: {
            registrationsOpen: opts.registrationsOpen,
            inviteOnly: opts.inviteOnly,
        },
        create: {
            id: "global",
            registrationsOpen: opts.registrationsOpen ?? true,
            inviteOnly: opts.inviteOnly ?? false,
        },
    });
}

export async function createInvite(createdBy: string) {
    const code = crypto.randomBytes(8).toString("hex");
    const invite = await prisma.inviteCode.create({
        data: { code, createdBy },
    });
    return { code: invite.code };
}
