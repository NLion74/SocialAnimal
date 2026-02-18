import { FastifyPluginAsync } from "fastify";
import crypto from "crypto";
import {
    hashPassword,
    verifyPassword,
    generateToken,
    authenticateToken,
} from "../utils/auth";
import { prisma } from "../utils/db";
import {
    badRequest,
    notFound,
    forbidden,
    serverError,
} from "../utils/response";

async function getOrCreateAppSettings() {
    return prisma.appSettings.upsert({
        where: { id: "global" },
        update: {},
        create: { id: "global", registrationsOpen: true, inviteOnly: false },
    });
}

const usersRoutes: FastifyPluginAsync = async (fastify) => {
    // ── Register ──────────────────────────────────────────────────────────
    fastify.post("/register", async (request, reply) => {
        try {
            const { email, password, name, inviteCode } = request.body as any;
            if (!email || !password)
                return badRequest(reply, "Email and password required");

            const isFirstUser = (await prisma.user.count()) === 0;

            if (!isFirstUser) {
                const settings = await getOrCreateAppSettings();
                if (!settings.registrationsOpen)
                    return reply
                        .status(403)
                        .send({ error: "Registrations are closed" });
                if (settings.inviteOnly) {
                    if (!inviteCode)
                        return reply
                            .status(403)
                            .send({ error: "Invite code required" });
                    const invite = await prisma.inviteCode.findUnique({
                        where: { code: inviteCode },
                    });
                    if (!invite || invite.usedBy)
                        return reply
                            .status(403)
                            .send({ error: "Invalid or used invite code" });
                    await prisma.inviteCode.update({
                        where: { code: inviteCode },
                        data: { usedBy: "pending", usedAt: new Date() },
                    });
                }
            }

            const existing = await prisma.user.findUnique({ where: { email } });
            if (existing) return badRequest(reply, "User already exists");

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
            return reply.status(201).send(user);
        } catch (err) {
            fastify.log.error(err);
            return serverError(reply);
        }
    });

    // ── Login ─────────────────────────────────────────────────────────────
    fastify.post("/login", async (request, reply) => {
        try {
            const { email, password } = request.body as any;
            if (!email || !password)
                return badRequest(reply, "Email and password required");
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user)
                return reply.status(401).send({ error: "Invalid credentials" });
            const valid = await verifyPassword(
                password,
                user.passwordHash,
                user.salt,
            );
            if (!valid)
                return reply.status(401).send({ error: "Invalid credentials" });
            return reply.send({
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    isAdmin: user.isAdmin,
                },
                token: generateToken(user.id),
            });
        } catch (err) {
            fastify.log.error(err);
            return serverError(reply);
        }
    });

    // ── Me ────────────────────────────────────────────────────────────────
    fastify.get("/me", { preHandler: authenticateToken }, async (request) => {
        const uid = (request as any).user.id;
        return prisma.user.findUnique({
            where: { id: uid },
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

    fastify.patch(
        "/me",
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const uid = (request as any).user.id;
                const {
                    name,
                    currentPassword,
                    newPassword,
                    defaultSharePermission,
                } = request.body as any;
                const user = await prisma.user.findUnique({
                    where: { id: uid },
                });
                if (!user) return notFound(reply);

                if (newPassword) {
                    if (!currentPassword)
                        return badRequest(reply, "Current password required");
                    const valid = await verifyPassword(
                        currentPassword,
                        user.passwordHash,
                        user.salt,
                    );
                    if (!valid)
                        return reply
                            .status(401)
                            .send({ error: "Current password incorrect" });
                    const { hash, salt } = await hashPassword(newPassword);
                    await prisma.user.update({
                        where: { id: uid },
                        data: { passwordHash: hash, salt },
                    });
                }
                if (name !== undefined)
                    await prisma.user.update({
                        where: { id: uid },
                        data: { name },
                    });
                if (defaultSharePermission !== undefined)
                    await prisma.userSettings.upsert({
                        where: { userId: uid },
                        update: { defaultSharePermission },
                        create: { userId: uid, defaultSharePermission },
                    });

                return prisma.user.findUnique({
                    where: { id: uid },
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        isAdmin: true,
                        settings: true,
                    },
                });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply);
            }
        },
    );

    // ── App settings (admin only) ─────────────────────────────────────────
    fastify.get(
        "/app-settings",
        { preHandler: authenticateToken },
        async (request, reply) => {
            const uid = (request as any).user.id;
            const user = await prisma.user.findUnique({
                where: { id: uid },
                select: { isAdmin: true },
            });
            if (!user?.isAdmin) return forbidden(reply);
            return getOrCreateAppSettings();
        },
    );

    fastify.patch(
        "/app-settings",
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const uid = (request as any).user.id;
                const user = await prisma.user.findUnique({
                    where: { id: uid },
                    select: { isAdmin: true },
                });
                if (!user?.isAdmin) return forbidden(reply);
                const { registrationsOpen, inviteOnly } = request.body as any;
                return prisma.appSettings.upsert({
                    where: { id: "global" },
                    update: { registrationsOpen, inviteOnly },
                    create: { id: "global", registrationsOpen, inviteOnly },
                });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply);
            }
        },
    );

    // ── Invite codes (admin only) ─────────────────────────────────────────
    fastify.post(
        "/invite",
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const uid = (request as any).user.id;
                const user = await prisma.user.findUnique({
                    where: { id: uid },
                    select: { isAdmin: true },
                });
                if (!user?.isAdmin) return forbidden(reply);
                const code = crypto.randomBytes(8).toString("hex");
                const invite = await prisma.inviteCode.create({
                    data: { code, createdBy: uid },
                });
                return reply.status(201).send({ code: invite.code });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply);
            }
        },
    );
};

export default usersRoutes;
