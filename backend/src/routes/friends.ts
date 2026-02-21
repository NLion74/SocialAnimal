import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { authenticateToken } from "../utils/auth";
import * as friendService from "../services/friendService";
import {
    badRequest,
    notFound,
    forbidden,
    serverError,
} from "../utils/response";

const authOptions: any = {
    preHandler: authenticateToken,
    schema: { security: [{ bearerAuth: [] }] },
};

const friendsRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get(
        "/",
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const uid = request.user.id;
                const result =
                    await friendService.listFriendshipsWithShares(uid);
                return result;
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to fetch friends");
            }
        },
    );

    fastify.post(
        "/request",
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const uid = request.user.id;
                const { email } = request.body as any;
                if (!email) return badRequest(reply, "Email required");

                const res = await friendService.requestFriend(uid, email);

                if (res === "not-found")
                    return notFound(reply, "User not found");
                if (res === "self")
                    return badRequest(reply, "Cannot friend yourself");
                if (res === "exists")
                    return badRequest(reply, "Friendship already exists");

                return reply.status(201).send(res);
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to send friend request");
            }
        },
    );

    fastify.post(
        "/:id/accept",
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const uid = request.user.id;
                const { id } = request.params as any;
                const updated = await friendService.acceptFriendRequest(
                    uid,
                    id,
                );
                if (!updated)
                    return notFound(reply, "Friend request not found");
                return updated;
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to accept friend request");
            }
        },
    );

    fastify.delete(
        "/:id",
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const uid = request.user.id;
                const { id } = request.params as any;
                const ok = await friendService.removeFriendship(uid, id);
                if (!ok) return notFound(reply, "Friendship not found");
                return reply.status(204).send();
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to remove friend");
            }
        },
    );

    fastify.post(
        "/share-calendar",
        authOptions,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const uid = request.user.id;
                const {
                    friendId,
                    calendarId,
                    share,
                    permission = "full",
                } = request.body as any;

                const res = await friendService.setCalendarShare({
                    ownerId: uid,
                    friendId,
                    calendarId,
                    share,
                    permission,
                });

                if (res === "not-friend")
                    return forbidden(reply, "Not friends");
                if (res === "no-calendar")
                    return notFound(reply, "Calendar not found");

                return { ok: true };
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to update share");
            }
        },
    );
};

export default friendsRoutes;
