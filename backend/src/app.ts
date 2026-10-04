import Fastify, { LogController, type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { prisma } from "./core/database";
import { errors, fail } from "./core/http";
import { documentApi } from "./core/http/openapi";
import { loggingOptions, logRequests } from "./core/http/logging";
import identity from "./modules/identity";
import profiles from "./modules/profiles";
import invitations from "./modules/invitations";
import settings from "./modules/settings";
import social from "./modules/social";
import calendars from "./modules/calendars";
import integrations from "./modules/integrations";
import admin from "./modules/admin";
import sharing, { permissionConditionSchema } from "./modules/sharing";

export async function buildApp(): Promise<FastifyInstance> {
	const app = Fastify({
		logger: loggingOptions(),
		logController: new LogController({ disableRequestLogging: true }),
		requestIdHeader: false,
		trustProxy:
			process.env.TRUSTED_PROXY_CIDRS?.split(",")
				.map((value) => value.trim())
				.filter(Boolean) || false,
		bodyLimit: 131072,
		ajv: { customOptions: { removeAdditional: false } },
	});

	logRequests(app);

	app.addHook("onRequest", async (_req, reply) => {
		reply.header("Cache-Control", "no-store");
		reply.header("X-Content-Type-Options", "nosniff");
	});

	app.addHook("preValidation", async (req) => {
		const pending: Array<{ value: unknown; depth: number }> = [
			{ value: req.body, depth: 0 },
		];

		let nodes = 0;

		while (pending.length) {
			const { value, depth } = pending.pop()!;

			if (++nodes > 10000 || depth > 24)
				fail(
					400,
					"INVALID_REQUEST",
					"Request structure is too complex",
				);

			if (value && typeof value === "object")
				for (const child of Object.values(value))
					pending.push({ value: child, depth: depth + 1 });
		}
	});

	app.addSchema(permissionConditionSchema);
	errors(app);
	documentApi(app);

	const origins = (
		process.env.CORS_ORIGINS ||
		process.env.PUBLIC_URL ||
		"http://localhost:3000"
	)
		.split(",")
		.map((value) => new URL(value.trim()).origin);

	await app.register(cors, { origin: origins });

	app.addHook("onRoute", (route) => {
		if (route.url === "/health" || route.url === "/ready") {
			route.config = { ...route.config, rateLimit: false };
			return;
		}

		const sensitive =
			route.url.includes("/auth/") ||
			route.url.includes("password-reset") ||
			route.url.endsWith("/me/password");

		const expensive =
			route.url.startsWith("/feeds/") ||
			route.url.includes("previews") ||
			route.url.endsWith("/discoveries") ||
			route.url.endsWith("/tests");

		if (sensitive || expensive)
			route.config = {
				...route.config,
				rateLimit: {
					max: sensitive ? 10 : 30,
					timeWindow: "1 minute",
					groupId: sensitive
						? "authentication"
						: "provider-and-preview",
				},
			};
	});

	await app.register(rateLimit, {
		max: 300,
		timeWindow: "1 minute",
		cache: 10000,
		errorResponseBuilder: (req) => ({
			statusCode: 429,
			code: "RATE_LIMITED",
			message: "Too many requests. Try again shortly.",
			requestId: req.id,
		}),
	});

	app.get("/health", async () => ({
		status: "ok",
		uptime: process.uptime(),
	}));

	app.get("/ready", async (_req, reply) => {
		try {
			await prisma.$queryRaw`SELECT 1`;
			return { status: "ready" };
		} catch {
			return reply.code(503).send({ status: "unavailable" });
		}
	});

	for (const root of [
		"users",
		"calendars",
		"events",
		"friends",
		"providers",
	]) {
		for (const path of [`/api/${root}`, `/api/${root}/*`])
			app.all(path, async (req, reply) =>
				reply.code(410).send({
					code: "API_VERSION_RETIRED",
					message:
						"Use /api/v1. Replace old calendar subscription URLs.",
					requestId: req.id,
				}),
			);
	}

	for (const plugin of [
		admin,
		identity,
		profiles,
		invitations,
		settings,
		social,
		calendars,
		integrations,
	])
		await app.register(plugin, { prefix: "/api/v1" });

	await app.register(sharing);
	await app.ready();
	return app;
}
