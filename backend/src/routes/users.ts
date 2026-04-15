import { FastifyPluginAsync, FastifyRequest } from "fastify";
import { authenticateToken } from "../utils/auth";
import { badRequest, notFound, serverError } from "../utils/response";
import * as usersService from "../services/usersService";
import { getOrCreateAppSettings } from "../services/adminService";

const authOptions: any = {
    preHandler: authenticateToken,
    schema: { security: [{ bearerAuth: [] }] },
};

const usersRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post("/register", async (request, reply) => {
        try {
            const { email, password, name, inviteCode } = request.body as any;
            if (!email || !password)
                return badRequest(reply, "Email and password required");

            const res = await usersService.registerUser({
                email,
                password,
                name,
                inviteCode,
            });
            if (res === "closed")
                return reply
                    .status(403)
                    .send({ error: "Registrations are closed" });
            if (res === "invite-required")
                return reply
                    .status(403)
                    .send({ error: "Invite code required" });
            if (res === "exists")
                return badRequest(reply, "User already exists");
            if (res === "invite-invalid")
                return reply
                    .status(403)
                    .send({ error: "Invalid or used invite code" });

            return reply.status(201).send(res);
        } catch (err) {
            fastify.log.error(err);
            return serverError(reply);
        }
    });

    fastify.post("/login", async (request, reply) => {
        try {
            const { email, password } = request.body as any;
            if (!email || !password)
                return badRequest(reply, "Email and password required");
            const res = await usersService.loginUser(email, password);
            if (!res)
                return reply.status(401).send({ error: "Invalid credentials" });
            return reply.send(res);
        } catch (err) {
            fastify.log.error(err);
            return serverError(reply);
        }
    });

    fastify.get("/public-settings", async (_request, reply) => {
        try {
            const settings = await getOrCreateAppSettings();
            return {
                registrationsOpen: settings.registrationsOpen,
                inviteOnly: settings.inviteOnly,
            };
        } catch (err) {
            fastify.log.error(err);
            return serverError(reply);
        }
    });

    fastify.get("/me", authOptions, async (request: FastifyRequest) => {
        return usersService.getMe(request.user.id);
    });

    fastify.put("/me", authOptions, async (request: FastifyRequest, reply) => {
        try {
            const res = await usersService.updateMe(
                request.user.id,
                request.body as any,
            );
            if (!res) return notFound(reply);
            return res;
        } catch (err: any) {
            if (err?.message === "Current password required")
                return badRequest(reply, "Current password required");
            if (err?.message === "Current password incorrect")
                return reply.status(401).send({
                    error: "Invalid credentials",
                    code: "INVALID_CREDENTIALS",
                });
            fastify.log.error(err);
            return serverError(reply);
        }
    });

    fastify.delete(
        "/me",
        authOptions,
        async (request: FastifyRequest, reply) => {
            try {
                const { password } = (request.body as any) || {};
                const res = await usersService.deleteMe(
                    request.user.id,
                    password,
                );
                if (!res) return notFound(reply);
                return reply.status(204).send();
            } catch (err: any) {
                if (err?.message === "Password required")
                    return badRequest(reply, "Password required");
                if (err?.message === "Password incorrect")
                    return badRequest(reply, "Password incorrect");
                fastify.log.error(err);
                return serverError(reply);
            }
        },
    );
};

export default usersRoutes;
