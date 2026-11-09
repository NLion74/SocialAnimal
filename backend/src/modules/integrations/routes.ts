import type { FastifyPluginAsync } from "fastify";
import type { CalendarType } from "@prisma/client";
import { prisma } from "../../core/database";
import {
	decrypt,
	encrypt,
	opaqueToken,
	tokenHash,
	type Credentials,
} from "../../core/secrets";
import { authenticateToken } from "../identity";
import {
	contract,
	obj,
	str,
	bool,
	nullableString,
	list,
	pageArgs,
	page,
	pageQuery,
	type PageQuery,
	fail,
} from "../../core/http";
import { registry } from "./adapters";
import {
	connectionForUser,
	publicConnection,
	withProvider,
	importCalendar,
	provider,
	capability,
} from "./operations";
import { submitSync } from "./sync";
import { calendarSchema } from "../calendars";

const connection = obj({ id: str, name: str, type: str, hasCredentials: bool });

const credentials = obj(
	{
		url: str,
		username: str,
		password: str,
		accessToken: str,
		refreshToken: str,
	},
	[],
);

const routes: FastifyPluginAsync = async (app) => {
	app.get(
		"/providers",
		{
			preHandler: authenticateToken,
			schema: contract(
				"providers",
				list(
					obj({
						id: str,
						name: str,
						discovery: bool,
						sync: bool,
						test: bool,
						oauth: bool,
						import: bool,
					}),
				),
			),
		},
		async () => ({
			items: Object.entries(registry).map(([id, adapter]) => ({
				id,
				name: adapter.name,
				discovery: !!adapter.discover,
				sync: !!adapter.fetch,
				test: !!adapter.test,
				oauth: !!adapter.authorize,
				import: !!adapter.fetch,
			})),
			nextCursor: null,
		}),
	);

	app.get<{ Querystring: PageQuery & { flow?: string } }>(
		"/connections",
		{
			preHandler: authenticateToken,
			schema: contract("connections", list(connection), {
				querystring: obj({ ...pageQuery, flow: str }, []),
			}),
		},
		async (req) => {
			let id: string | undefined;

			if (req.query.flow) {
				const flow = await prisma.oAuthFlow.findFirst({
					where: {
						id: req.query.flow,
						userId: req.user.id,
						expiresAt: { gt: new Date() },
						connectionId: { not: null },
					},
				});

				if (!flow)
					return fail(
						404,
						"FLOW_EXPIRED",
						"Authorization flow expired",
					);

				id = flow.connectionId!;
			}

			const result = page(
				await prisma.connection.findMany({
					where: { userId: req.user.id, ...(id ? { id } : {}) },
					...pageArgs(req.query),
				}),
				req.query,
			);

			return { ...result, items: result.items.map(publicConnection) };
		},
	);

	app.post<{
		Body: { type: CalendarType; name: string; credentials: Credentials };
	}>(
		"/connections",
		{
			preHandler: authenticateToken,
			schema: contract(
				"createConnection",
				connection,
				{
					body: obj({
						type: { type: "string", enum: Object.keys(registry) },
						name: { type: "string", minLength: 1, maxLength: 100 },
						credentials,
					}),
				},
				201,
			),
		},
		async (req, reply) => {
			provider(req.body.type);

			const row = await prisma.connection.create({
				data: {
					...req.body,
					userId: req.user.id,
					credentials: encrypt(req.body.credentials),
				},
			});

			return reply.code(201).send(publicConnection(row));
		},
	);

	app.patch<{
		Params: { id: string };
		Body: { name?: string; credentials?: Credentials };
	}>(
		"/connections/:id",
		{
			preHandler: authenticateToken,
			schema: contract("updateConnection", connection, {
				body: obj({ name: str, credentials }, []),
			}),
		},
		async (req) => {
			const row = await connectionForUser(req.params.id, req.user.id);

			return publicConnection(
				await prisma.connection.update({
					where: { id: row.id },
					data: {
						name: req.body.name,
						...(req.body.credentials
							? {
									credentials: encrypt({
										...decrypt(row.credentials),
										...req.body.credentials,
									}),
								}
							: {}),
					},
				}),
			);
		},
	);

	app.post<{ Params: { id: string }; Querystring: PageQuery }>(
		"/connections/:id/discoveries",
		{
			preHandler: authenticateToken,
			schema: contract(
				"discoverConnection",
				list(
					obj(
						{
							id: str,
							remoteId: str,
							name: str,
							importedCalendarId: nullableString,
							color: str,
						},
						["id", "remoteId", "name", "importedCalendarId"],
					),
				),
				{ querystring: obj(pageQuery, []) },
			),
		},
		async (req) => {
			const remote = await withProvider(
				req.params.id,
				req.user.id,
				(p, c) => capability(p, "discover")(c),
			);

			const imported = await prisma.calendar.findMany({
				where: { connectionId: req.params.id, userId: req.user.id },
				select: { id: true, remoteId: true },
			});

			const rows = remote
				.map((r) => ({
					...r,
					id: r.remoteId,
					importedCalendarId:
						imported.find((c) => c.remoteId === r.remoteId)?.id ||
						null,
				}))
				.sort((a, b) => a.id.localeCompare(b.id));

			const start = req.query.cursor
				? rows.findIndex((r) => r.id === req.query.cursor) + 1
				: 0;

			return page(rows.slice(start), req.query);
		},
	);

	app.post<{ Params: { id: string } }>(
		"/connections/:id/tests",
		{
			preHandler: authenticateToken,
			schema: contract("testConnection", obj({ success: bool })),
		},
		async (req) => {
			await withProvider(req.params.id, req.user.id, (p, c) =>
				capability(p, "test")(c),
			);

			return { success: true };
		},
	);

	app.post<{
		Body: {
			connectionId: string;
			remoteId: string;
			name: string;
			syncInterval?: number;
		};
	}>(
		"/calendar-imports",
		{
			preHandler: authenticateToken,
			schema: contract(
				"importCalendar",
				calendarSchema,
				{
					body: obj(
						{
							connectionId: str,
							remoteId: { type: "string", minLength: 1 },
							name: { type: "string", minLength: 1 },
							syncInterval: { type: "integer", minimum: 0 },
						},
						["connectionId", "remoteId", "name"],
					),
				},
				201,
			),
		},
		async (req, reply) => {
			const calendar = await importCalendar(req.user.id, req.body);
			await submitSync(calendar.id);
			return reply.code(201).send(calendar);
		},
	);

	app.post(
		"/connections/google/authorizations",
		{
			preHandler: authenticateToken,
			schema: contract("googleAuthorization", obj({ url: str })),
		},
		async (req) => {
			const state = opaqueToken();
			const authorize = capability(provider("google"), "authorize");
			let url: string;

			try {
				url = authorize.url(state);
			} catch {
				return fail(
					503,
					"PROVIDER_NOT_CONFIGURED",
					"Google OAuth is not configured",
				);
			}

			await prisma.oAuthFlow.create({
				data: {
					userId: req.user.id,
					stateHash: tokenHash(state),
					expiresAt: new Date(Date.now() + 600000),
				},
			});

			return { url };
		},
	);

	app.get<{
		Querystring: { state: string; code?: string; error?: string };
	}>(
		"/connections/google/callback",
		{
			schema: {
				querystring: {
					...obj(
						{
							state: { ...str, minLength: 1, maxLength: 512 },
							code: { ...str, minLength: 1, maxLength: 4096 },
							iss: {
								...str,
								const: "https://accounts.google.com",
							},
							scope: { ...str, maxLength: 8192 },
							authuser: { ...str, maxLength: 64 },
							prompt: { ...str, maxLength: 256 },
							hd: { ...str, maxLength: 253 },
							error: { ...str, minLength: 1, maxLength: 256 },
							error_description: { ...str, maxLength: 2048 },
							error_uri: { ...str, maxLength: 2048 },
						},
						["state"],
					),
					oneOf: [{ required: ["code"] }, { required: ["error"] }],
				},
			},
		},
		async (req, reply) => {
			reply.header("Referrer-Policy", "no-referrer");

			const flow = await prisma.oAuthFlow.findUnique({
				where: { stateHash: tokenHash(req.query.state) },
			});

			if (!flow)
				return fail(
					400,
					"INVALID_STATE",
					"Invalid authorization state",
				);

			const user = await prisma.user.findUnique({
				where: { id: flow.userId },
				select: {
					disabled: true,
					accountRole: true,
					emailVerifiedAt: true,
					isAdmin: true,
				},
			});

			const settings = await prisma.appSettings.findUnique({
				where: { id: "global" },
			});

			if (
				!user ||
				user.disabled ||
				user.accountRole === "readonly" ||
				(settings?.requireEmailVerification &&
					!user.emailVerifiedAt &&
					!user.isAdmin)
			)
				fail(403, "FORBIDDEN", "This account cannot connect providers");

			const used = await prisma.oAuthFlow.updateMany({
				where: {
					id: flow.id,
					consumedAt: null,
					expiresAt: { gt: new Date() },
				},
				data: { consumedAt: new Date() },
			});

			if (!used.count)
				return fail(
					400,
					"INVALID_STATE",
					"Authorization state expired or used",
				);

			if (req.query.error)
				return fail(
					400,
					req.query.error === "access_denied"
						? "PROVIDER_AUTH_CANCELLED"
						: "PROVIDER_AUTH_FAILED",
					req.query.error === "access_denied"
						? "Google authorization was cancelled. Start again to connect your calendar."
						: "Google authorization failed. Start again to connect your calendar.",
				);

			try {
				const tokens = await capability(
					provider("google"),
					"authorize",
				).exchange(req.query.code!);

				await prisma.$transaction(async (tx) => {
					const row = await tx.connection.create({
						data: {
							userId: flow.userId,
							type: "google",
							name: "Google",
							credentials: encrypt(tokens),
						},
					});

					await tx.oAuthFlow.update({
						where: { id: flow.id },
						data: {
							connectionId: row.id,
							expiresAt: new Date(Date.now() + 600000),
						},
					});
				});
			} catch {
				return fail(
					502,
					"PROVIDER_AUTH_FAILED",
					"Google authorization failed",
				);
			}

			reply.header("Cache-Control", "no-store");

			return reply.redirect(
				`${process.env.PUBLIC_URL || "http://localhost:3000"}/dashboard?googleAuthSuccess=success&flow=${flow.id}`,
			);
		},
	);
};

export default routes;
