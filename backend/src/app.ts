import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { prisma } from "./core/database";
import { errors } from "./core/http";
import { documentApi } from "./core/http/openapi";
import identity from "./modules/identity";
import profiles from "./modules/profiles";
import invitations from "./modules/invitations";
import settings from "./modules/settings";
import social from "./modules/social";
import calendars from "./modules/calendars";
import integrations from "./modules/integrations";
import sharing from "./modules/sharing";

export async function buildApp(): Promise<FastifyInstance> {
	// Request URLs may contain feed/OAuth secrets; never log them or request bodies.
	const app = Fastify({
		logger: false,
		ajv: { customOptions: { removeAdditional: false } },
	});

	app.addHook("onRequest", async (_req, reply) => {
		reply.header("Cache-Control", "no-store");
		reply.header("X-Content-Type-Options", "nosniff");
	});

	errors(app);
	documentApi(app);
	await app.register(cors);

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
