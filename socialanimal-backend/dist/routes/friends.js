"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../auth");
const db_1 = require("../db");
const friendsRoutes = async (fastify) => {
    fastify.addHook("preHandler", auth_1.authenticateToken);
    fastify.get("/", async (request, reply) => {
        const friendships = await db_1.prisma.friendship.findMany({
            where: {
                OR: [
                    { user1Id: request.user.id },
                    { user2Id: request.user.id },
                ],
            },
            include: {
                user1: {
                    select: { id: true, email: true, name: true },
                },
                user2: {
                    select: { id: true, email: true, name: true },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return friendships;
    });
    fastify.post("/request", async (request, reply) => {
        try {
            const { userId } = request.body;
            if (!userId) {
                return reply.status(400).send({ error: "User ID required" });
            }
            if (userId === request.user.id) {
                return reply
                    .status(400)
                    .send({ error: "Cannot friend yourself" });
            }
            const existingFriendship = await db_1.prisma.friendship.findFirst({
                where: {
                    OR: [
                        { user1Id: request.user.id, user2Id: userId },
                        { user1Id: userId, user2Id: request.user.id },
                    ],
                },
            });
            if (existingFriendship) {
                return reply
                    .status(400)
                    .send({ error: "Friendship already exists" });
            }
            const friendship = await db_1.prisma.friendship.create({
                data: {
                    user1Id: request.user.id,
                    user2Id: userId,
                    status: "pending",
                },
                include: {
                    user2: {
                        select: { id: true, email: true, name: true },
                    },
                },
            });
            return reply.status(201).send(friendship);
        }
        catch (error) {
            return reply
                .status(500)
                .send({ error: "Failed to send friend request" });
        }
    });
    fastify.post("/:id/accept", async (request, reply) => {
        try {
            const { id } = request.params;
            const friendship = await db_1.prisma.friendship.findFirst({
                where: {
                    id,
                    user2Id: request.user.id,
                    status: "pending",
                },
            });
            if (!friendship) {
                return reply
                    .status(404)
                    .send({ error: "Friend request not found" });
            }
            const updatedFriendship = await db_1.prisma.friendship.update({
                where: { id },
                data: { status: "accepted" },
            });
            return reply.send(updatedFriendship);
        }
        catch (error) {
            return reply
                .status(500)
                .send({ error: "Failed to accept friend request" });
        }
    });
    fastify.delete("/:id", async (request, reply) => {
        try {
            const { id } = request.params;
            const friendship = await db_1.prisma.friendship.findFirst({
                where: {
                    id,
                    OR: [
                        { user1Id: request.user.id },
                        { user2Id: request.user.id },
                    ],
                },
            });
            if (!friendship) {
                return reply
                    .status(404)
                    .send({ error: "Friendship not found" });
            }
            await db_1.prisma.friendship.delete({
                where: { id },
            });
            return reply.status(204).send();
        }
        catch (error) {
            return reply.status(500).send({ error: "Failed to remove friend" });
        }
    });
};
exports.default = friendsRoutes;
