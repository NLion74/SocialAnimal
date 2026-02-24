import {
    FastifyPluginAsync,
    FastifyRequest,
    FastifyReply,
    RouteShorthandOptions,
} from "fastify";
import { authenticateToken } from "../utils/auth";
import {
    importIcsCalendar,
    importAllGoogleCalendars,
    getGoogleAuthUrl,
    testImportConnection,
} from "../services/importService";
import { badRequest, created, serverError } from "../utils/response";

const auth: RouteShorthandOptions & { schema?: any } = {
    preHandler: authenticateToken,
    schema: { security: [{ bearerAuth: [] }] },
};

const IMPORT_ICS_ERRORS = {
    "missing-name": "Name required",
    "missing-url": "URL required",
} as const;

const IMPORT_GOOGLE_ERRORS = {
    "not-configured": "Google OAuth not configured",
    "token-exchange-failed": "Failed to exchange OAuth code",
    "calendar-fetch-failed": "Failed to fetch Google calendars",
    "no-calendars-found": "No Google calendars found",
} as const;

const importRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.post(
        "/ics",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { name, url, config } = request.body as any;
                const result = await importIcsCalendar({
                    userId: request.user.id,
                    name,
                    url,
                    config,
                });

                if (typeof result === "string") {
                    return badRequest(reply, IMPORT_ICS_ERRORS[result]);
                }

                return created(reply, result);
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to import ICS calendar");
            }
        },
    );

    fastify.get(
        "/google/auth-url",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            const url = await getGoogleAuthUrl(request.user.id);
            if (url === "not-configured")
                return serverError(reply, "Google OAuth not configured");
            return { url };
        },
    );

    fastify.get(
        "/google/callback",
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { code, state } = request.query as {
                    code?: string;
                    state?: string;
                };

                fastify.log.info({ code: !!code, state }, "Google callback");

                if (!code || !state) {
                    fastify.log.error("Missing code or state");
                    return reply.redirect(
                        `${process.env.publicUrl || "http://localhost:3000"}?import=error&reason=invalid-callback`,
                    );
                }

                const result = await importAllGoogleCalendars(state, code);

                if (typeof result === "string") {
                    fastify.log.error(
                        { error: result },
                        "Google import failed",
                    );
                    return reply.redirect(
                        `${process.env.publicUrl || "http://localhost:3000"}?import=error&reason=${result}`,
                    );
                }

                fastify.log.info(
                    { count: result.count },
                    "Google import success",
                );
                return reply.redirect(
                    `${process.env.publicUrl || "http://localhost:3000"}?import=success&count=${result.count}`,
                );
            } catch (error) {
                fastify.log.error(error, "Google callback error");
                return reply.redirect(
                    `${process.env.publicUrl || "http://localhost:3000"}?import=error`,
                );
            }
        },
    );

    fastify.post(
        "/test-connection",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { type, config } = request.body as any;
                if (!type || !config)
                    return badRequest(reply, "Type and config required");

                const result = await testImportConnection(type, config);

                if (result.success) return reply.status(200).send(result);

                return reply
                    .status(422)
                    .send({ error: result.error, canConnect: false });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Test failed");
            }
        },
    );
};

export default importRoutes;
