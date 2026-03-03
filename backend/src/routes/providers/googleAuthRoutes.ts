import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import jwt from "jsonwebtoken";
import { authenticateToken, verifyOAuthState } from "../../utils/auth";
import { handleProviderAuthUrl } from "../../services/importService";
import { handleProviderDiscover } from "../../services/discoverService";
import { serverError } from "../../utils/response";

const providerGoogleAuthRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get(
        "/auth-url",
        { preHandler: authenticateToken },
        async (request: FastifyRequest, reply: FastifyReply) => {
            const result = await handleProviderAuthUrl("google", {
                userId: request.user.id,
            });
            if ("error" in result) {
                return serverError(reply, result.error);
            }
            return result;
        },
    );

    fastify.get(
        "/callback",
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { code, state } = request.query as {
                    code?: string;
                    state?: string;
                };
                if (!code || !state) {
                    return reply.redirect(
                        `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?import=error&reason=invalid-callback`,
                    );
                }

                const userId = verifyOAuthState(state);
                if (!userId) {
                    return reply.redirect(
                        `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?import=error&reason=invalid-state`,
                    );
                }

                const result = await handleProviderDiscover("google", {
                    code,
                });

                if (result?.error) {
                    return reply.redirect(
                        `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?import=error&reason=${encodeURIComponent(result.error)}`,
                    );
                }

                if (!result?.accessToken) {
                    return reply.redirect(
                        `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?import=error&reason=token-exchange-failed`,
                    );
                }

                const googleToken = jwt.sign(
                    {
                        userId,
                        accessToken: result.accessToken,
                        refreshToken: result.refreshToken || "",
                    },
                    process.env.JWT_SECRET ?? "changeme-secret",
                    { expiresIn: "15m" },
                );

                return reply.redirect(
                    `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?googleAuthSuccess=success&googleToken=${encodeURIComponent(googleToken)}`,
                );
            } catch {
                return reply.redirect(
                    `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?googleAuthSuccess=error`,
                );
            }
        },
    );
};

export default providerGoogleAuthRoutes;
