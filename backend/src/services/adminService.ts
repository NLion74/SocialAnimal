import { prisma } from "../utils/db";
import crypto from "crypto";

export async function getUserRole(userId: string) {
    const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
    });
    return u?.role ?? null;
}

export async function isAdmin(userId: string) {
    return (await getUserRole(userId)) === "admin";
}

export async function getOrCreateAppSettings() {
    return prisma.appSettings.upsert({
        where: { id: "global" },
        update: {},
        create: {
            id: "global",
            registrationsOpen: true,
            inviteOnly: false,
            maxCalendarsPerUser: 10,
            minSyncInterval: 15,
        },
    });
}

export async function setAppSettings(opts: {
    registrationsOpen?: boolean;
    inviteOnly?: boolean;
    maxCalendarsPerUser?: number;
    minSyncInterval?: number;
}) {
    return prisma.appSettings.upsert({
        where: { id: "global" },
        update: opts,
        create: {
            id: "global",
            registrationsOpen: opts.registrationsOpen ?? true,
            inviteOnly: opts.inviteOnly ?? false,
            maxCalendarsPerUser: opts.maxCalendarsPerUser ?? 10,
            minSyncInterval: opts.minSyncInterval ?? 15,
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

export async function getStats() {
    const [userCount, calendarCount, eventCount, usersByRole, calendarsByType] =
        await Promise.all([
            prisma.user.count(),
            prisma.calendar.count(),
            prisma.event.count(),
            prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
            prisma.calendar.groupBy({ by: ["type"], _count: { _all: true } }),
        ]);

    return {
        users: {
            total: userCount,
            byRole: Object.fromEntries(
                usersByRole.map((r: any) => [r.role, r._count._all]),
            ),
        },
        calendars: {
            total: calendarCount,
            byType: Object.fromEntries(
                calendarsByType.map((c: any) => [c.type, c._count._all]),
            ),
        },
        events: { total: eventCount },
    };
}

const USER_SELECT = {
    id: true,
    email: true,
    name: true,
    role: true,
    createdAt: true,
    maxCalendarsOverride: true,
    syncIntervalOverride: true,
    _count: { select: { calendars: true } },
} as const;

export async function listUsers(opts: {
    page?: number;
    limit?: number;
    role?: string;
    search?: string;
}) {
    const { page = 1, limit = 20, role, search } = opts;
    const where: any = {};
    if (role) where.role = role;
    if (search) {
        where.OR = [
            { email: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
        ];
    }

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: "desc" },
            select: USER_SELECT,
        }),
        prisma.user.count({ where }),
    ]);

    return { users, total, page, pages: Math.ceil(total / limit) };
}

export async function getUser(id: string) {
    return prisma.user.findUnique({
        where: { id },
        select: USER_SELECT,
    });
}

export async function updateUser(
    actorId: string,
    targetId: string,
    payload: {
        role?: string;
        maxCalendarsOverride?: number | null;
        syncIntervalOverride?: number | null;
    },
) {
    if (actorId === targetId)
        throw new Error("Cannot modify your own account via admin panel");

    const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { role: true },
    });
    if (!target) return null;

    return prisma.user.update({
        where: { id: targetId },
        data: payload as any,
        select: USER_SELECT,
    });
}

export async function deleteUser(actorId: string, targetId: string) {
    if (actorId === targetId)
        throw new Error("Cannot delete your own account via admin panel");

    const target = await prisma.user.findUnique({ where: { id: targetId } });
    if (!target) return null;

    await prisma.$transaction([
        prisma.calendar.deleteMany({ where: { userId: targetId } }),
        prisma.user.delete({ where: { id: targetId } }),
    ]);

    return { ok: true };
}
