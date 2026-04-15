import { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { authenticateToken } from "../utils/auth";
import {
    forbidden,
    notFound,
    serverError,
    badRequest,
} from "../utils/response";
import * as adminService from "../services/adminService";

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!(await adminService.isAdmin(request.user.id))) {
        return forbidden(reply);
    }
}

const adminOnly: any = {
    preHandler: [authenticateToken, requireAdmin],
    schema: { security: [{ bearerAuth: [] }] },
};

const adminRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get("/app-settings", adminOnly, async () => {
        return adminService.getOrCreateAppSettings();
    });

    fastify.put(
        "/app-settings",
        adminOnly,
        async (request: FastifyRequest, reply) => {
            try {
                const {
                    registrationsOpen,
                    inviteOnly,
                    maxCalendarsPerUser,
                    minSyncInterval,
                } = request.body as any;
                return adminService.setAppSettings({
                    registrationsOpen,
                    inviteOnly,
                    maxCalendarsPerUser,
                    minSyncInterval,
                });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply);
            }
        },
    );

    fastify.post(
        "/invite",
        adminOnly,
        async (request: FastifyRequest, reply) => {
            try {
                return adminService.createInvite(request.user.id);
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply);
            }
        },
    );

    fastify.get("/stats", adminOnly, async (_request, reply) => {
        try {
            return adminService.getStats();
        } catch (err) {
            fastify.log.error(err);
            return serverError(reply);
        }
    });

    fastify.get("/users", adminOnly, async (request: FastifyRequest, reply) => {
        try {
            const { page, limit, role, search } = request.query as any;
            return adminService.listUsers({
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                role,
                search,
            });
        } catch (err) {
            fastify.log.error(err);
            return serverError(reply);
        }
    });

    fastify.get(
        "/users/:id",
        adminOnly,
        async (request: FastifyRequest, reply) => {
            try {
                const { id } = request.params as any;
                const user = await adminService.getUser(id);
                if (!user) return notFound(reply);
                return user;
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply);
            }
        },
    );

    fastify.put(
        "/users/:id",
        adminOnly,
        async (request: FastifyRequest, reply) => {
            try {
                const { id } = request.params as any;
                const { role, maxCalendarsOverride, syncIntervalOverride } =
                    request.body as any;
                const res = await adminService.updateUser(request.user.id, id, {
                    role,
                    maxCalendarsOverride,
                    syncIntervalOverride,
                });
                if (!res) return notFound(reply);
                return res;
            } catch (err: any) {
                if (
                    err?.message ===
                    "Cannot modify your own account via admin panel"
                )
                    return badRequest(reply, err.message);
                fastify.log.error(err);
                return serverError(reply);
            }
        },
    );

    fastify.delete(
        "/users/:id",
        adminOnly,
        async (request: FastifyRequest, reply) => {
            try {
                const { id } = request.params as any;
                const res = await adminService.deleteUser(request.user.id, id);
                if (!res) return notFound(reply);
                return reply.status(204).send();
            } catch (err: any) {
                if (
                    err?.message ===
                    "Cannot delete your own account via admin panel"
                )
                    return badRequest(reply, err.message);
                fastify.log.error(err);
                return serverError(reply);
            }
        },
    );
};

export default adminRoutes;
