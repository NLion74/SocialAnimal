import { prisma } from "../utils/db";
import { hashPassword, verifyPassword, generateToken } from "../utils/auth";
import { getOrCreateAppSettings } from "./adminService";

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
    return prisma.user.create({
        data: {
            email,
            passwordHash: hash,
            salt,
            name,
            role: isFirstUser ? "admin" : "user",
        },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
        },
    });
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
            role: user.role,
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
            role: true,
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
        firstDayOfWeek,
        timezone,
        defaultTab,
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

    if (
        firstDayOfWeek !== undefined ||
        timezone !== undefined ||
        defaultTab !== undefined
    ) {
        await prisma.userSettings.upsert({
            where: { userId },
            update: {
                ...(firstDayOfWeek !== undefined ? { firstDayOfWeek } : {}),
                ...(timezone !== undefined ? { timezone } : {}),
                ...(defaultTab !== undefined ? { defaultTab } : {}),
            },
            create: {
                userId,
                firstDayOfWeek: firstDayOfWeek ?? "monday",
                timezone: timezone ?? "UTC",
                defaultTab: defaultTab ?? "dashboard",
            },
        });
    }

    return getMe(userId);
}

export async function deleteMe(userId: string, password: string) {
    if (!password) throw new Error("Password required");
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return null;
    const valid = await verifyPassword(password, user.passwordHash, user.salt);
    if (!valid) throw new Error("Password incorrect");
    await prisma.$transaction([
        prisma.calendar.deleteMany({ where: { userId } }),
        prisma.user.delete({ where: { id: userId } }),
    ]);
    return { ok: true };
}
