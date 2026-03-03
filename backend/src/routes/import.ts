import {
    FastifyPluginAsync,
    FastifyRequest,
    FastifyReply,
    RouteShorthandOptions,
} from "fastify";
import jwt from "jsonwebtoken";
import { authenticateToken } from "../utils/auth";
import {
    importIcsCalendar,
    discoverCaldavCalendars,
    importCaldavCalendars,
    discoverICloudCalendars,
    importICloudCalendars,
    getGoogleAuthUrl,
    testImportConnection,
    exchangeGoogleCode,
    fetchGoogleCalendars,
    importGoogleCalendar,
} from "../services/importService";
import { badRequest, created, serverError } from "../utils/response";
import { prisma } from "../utils/db";

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

const IMPORT_CALDAV_ERRORS = {
    "missing-calendars": "At least one calendar must be selected",
    "missing-url": "CalDAV server URL is required",
} as const;

const IMPORT_ICLOUD_ERRORS = {
    "missing-calendars": "At least one calendar must be selected",
} as const;

function normalizeCalendars(
    calendars: any[],
    credentialsUrl?: string,
): { name: string; url: string; calendarPath: string }[] {
    return calendars.map((cal) => {
        const resolvedUrl = cal.url || cal.calendarPath || credentialsUrl || "";
        return {
            name: cal.name || resolvedUrl,
            url: resolvedUrl,
            calendarPath: resolvedUrl,
        };
    });
}

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

    fastify.post(
        "/caldav/discover",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { url, username, password } = request.body as any;

                const calendars = await discoverCaldavCalendars({
                    url: url || "",
                    username: username || "",
                    password: password || "",
                });

                return reply.send({ calendars });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to discover calendars");
            }
        },
    );

    fastify.post(
        "/caldav",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { credentials, calendars } = request.body as any;

                if (!calendars?.length) {
                    return badRequest(
                        reply,
                        IMPORT_CALDAV_ERRORS["missing-calendars"],
                    );
                }

                const normalized = normalizeCalendars(
                    calendars,
                    credentials?.url,
                );

                const result = await importCaldavCalendars({
                    userId: request.user.id,
                    credentials,
                    calendars: normalized,
                });

                if (typeof result === "string") {
                    return badRequest(reply, IMPORT_CALDAV_ERRORS[result]);
                }

                return created(reply, result);
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to import CalDAV calendars");
            }
        },
    );

    fastify.post(
        "/icloud/discover",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { username, password } = request.body as any;

                const calendars = await discoverICloudCalendars({
                    username: username || "",
                    password: password || "",
                });

                return reply.send({ calendars });
            } catch (err) {
                fastify.log.error(err);
                return serverError(
                    reply,
                    "Failed to discover iCloud calendars",
                );
            }
        },
    );

    fastify.post(
        "/icloud",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { credentials, calendars } = request.body as any;

                if (!calendars?.length) {
                    return badRequest(
                        reply,
                        IMPORT_ICLOUD_ERRORS["missing-calendars"],
                    );
                }

                const normalized = normalizeCalendars(calendars);

                const result = await importICloudCalendars({
                    userId: request.user.id,
                    credentials,
                    calendars: normalized,
                });

                if (typeof result === "string") {
                    return badRequest(reply, IMPORT_ICLOUD_ERRORS[result]);
                }

                return created(reply, result);
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to import iCloud calendars");
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
                        `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?import=error&reason=invalid-callback`,
                    );
                }

                const tokens = await exchangeGoogleCode(code);

                if (tokens === "token-exchange-failed") {
                    fastify.log.error("Token exchange failed");
                    return reply.redirect(
                        `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?import=error&reason=token-exchange-failed`,
                    );
                }

                const tempToken = jwt.sign(
                    {
                        userId: state,
                        accessToken: tokens.accessToken,
                        refreshToken: tokens.refreshToken,
                    },
                    process.env.JWT_SECRET!,
                    { expiresIn: "15m" },
                );

                fastify.log.info(
                    { userId: state },
                    "Google auth success, redirecting to select",
                );

                return reply.redirect(
                    `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?googleToken=${tempToken}&googleAuthSuccess=success`,
                );
            } catch (error) {
                fastify.log.error(error, "Google callback error");
                return reply.redirect(
                    `${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?googleAuthSuccess=error`,
                );
            }
        },
    );

    fastify.post(
        "/google/list",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { token } = request.body as { token: string };

                if (!token) {
                    return badRequest(reply, "Token required");
                }

                const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
                    userId: string;
                    accessToken: string;
                    refreshToken: string;
                };

                if (decoded.userId !== request.user.id) {
                    return reply
                        .status(403)
                        .send({ error: "Token user mismatch" });
                }

                const calendars = await fetchGoogleCalendars(
                    decoded.accessToken,
                );

                if (typeof calendars === "string") {
                    return serverError(reply, IMPORT_GOOGLE_ERRORS[calendars]);
                }

                return reply.send({ calendars });
            } catch (err) {
                fastify.log.error(err);
                if (err instanceof jwt.JsonWebTokenError) {
                    return badRequest(reply, "Invalid or expired token");
                }
                return serverError(reply, "Failed to list Google calendars");
            }
        },
    );

    fastify.get(
        "/google/imported",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const calendars = await prisma.calendar.findMany({
                    where: {
                        userId: request.user.id,
                        type: "google",
                    },
                    select: {
                        id: true,
                        name: true,
                        config: true,
                        createdAt: true,
                    },
                });

                const importedCalendarIds = calendars
                    .map((cal: any) => cal.config?.calendarId)
                    .filter(Boolean);

                return reply.send({
                    calendars: calendars.map(
                        (cal: {
                            id: string;
                            name: string;
                            config: any;
                            createdAt: Date;
                        }) => ({
                            id: cal.id,
                            name: cal.name,
                            externalId: cal.config?.calendarId,
                            createdAt: cal.createdAt,
                        }),
                    ),
                    importedCalendarIds,
                });
            } catch (err) {
                fastify.log.error(err);
                return serverError(reply, "Failed to get imported calendars");
            }
        },
    );

    fastify.post(
        "/google/import",
        auth,
        async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const { token, calendarIds } = request.body as {
                    token: string;
                    calendarIds: string[];
                };

                if (!token || !calendarIds?.length) {
                    return badRequest(reply, "Token and calendar IDs required");
                }

                const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
                    userId: string;
                    accessToken: string;
                    refreshToken: string;
                };

                if (decoded.userId !== request.user.id) {
                    return reply
                        .status(403)
                        .send({ error: "Token user mismatch" });
                }

                const allCalendars = await fetchGoogleCalendars(
                    decoded.accessToken,
                );

                if (typeof allCalendars === "string") {
                    return serverError(
                        reply,
                        IMPORT_GOOGLE_ERRORS[allCalendars],
                    );
                }

                const selectedCalendars = allCalendars.filter((cal) =>
                    calendarIds.includes(cal.id),
                );

                const imported = [];
                for (const cal of selectedCalendars) {
                    const calendar = await importGoogleCalendar({
                        userId: request.user.id,
                        calendarId: cal.id,
                        summary: cal.summary,
                        accessToken: decoded.accessToken,
                        refreshToken: decoded.refreshToken,
                    });
                    imported.push(calendar);
                }

                fastify.log.info(
                    { count: imported.length, userId: request.user.id },
                    "Google calendars imported",
                );

                return created(reply, {
                    count: imported.length,
                    calendars: imported,
                });
            } catch (err) {
                fastify.log.error(err);
                if (err instanceof jwt.JsonWebTokenError) {
                    return badRequest(reply, "Invalid or expired token");
                }
                return serverError(reply, "Failed to import calendars");
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
