import { visiblePage } from "../../core/http/visible-page";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../core/database";
import { authenticateToken } from "../identity";
import {
	contract,
	obj,
	str,
	integer,
	date,
	array,
	list,
	page,
	pageArgs,
	pageQuery,
	fail,
	type PageQuery,
} from "../../core/http";
import {
	attributes,
	operators,
	limits,
	type Ruleset,
} from "../../services/permissions";
import { saveRuleset, validateDocument } from "./rulesets";
import {
	rulesetFields,
	rulesetSchema,
	previewEventSchema,
} from "./rule-schemas";
import { eventAccess } from "./event-access";

const routes: FastifyPluginAsync = async (app) => {
	app.addHook("preHandler", authenticateToken);
	// Bound the tree before the recursive JSON-schema validator runs.
	app.addHook("preValidation", async (req) => {
		if (
			["POST", "PUT"].includes(req.method) &&
			req.routeOptions.url?.match(/\/rulesets(?:\/|$)/)
		) {
			const body = req.body as Record<string, unknown> | null;
			validateDocument({ fallback: body?.fallback, rules: body?.rules });
		}
	});

	app.get(
		"/api/v1/permission-registry",
		{
			schema: contract(
				"permissionRegistry",
				obj({
					attributes: array(
						obj(
							{
								id: str,
								label: str,
								type: {
									type: "string",
									enum: [
										"string",
										"number",
										"date",
										"time",
										"day",
									],
								},
								source: str,
								choices: array(str),
							},
							["id", "label", "type", "source"],
						),
					),
					operators: obj(
						Object.fromEntries(
							Object.keys(operators).map((key) => [
								key,
								array(str),
							]),
						),
					),
					limits: obj(
						Object.fromEntries(
							Object.keys(limits).map((key) => [key, integer]),
						),
					),
				}),
			),
		},
		async () => ({ attributes, operators, limits }),
	);

	app.get<{ Querystring: PageQuery }>(
		"/api/v1/rulesets",
		{
			schema: contract("rulesets", list(rulesetSchema), {
				querystring: obj(pageQuery, []),
			}),
		},
		async (req) =>
			page(
				await prisma.permissionRuleset.findMany({
					where: { userId: req.user.id },
					...pageArgs(req.query),
				}),
				req.query,
			),
	);

	app.post<{ Body: Ruleset & { name: string } }>(
		"/api/v1/rulesets",
		{
			schema: contract(
				"createRuleset",
				rulesetSchema,
				{ body: obj(rulesetFields) },
				201,
			),
		},
		async (req, reply) =>
			reply.code(201).send(await saveRuleset(req.user.id, req.body)),
	);

	app.put<{
		Params: { id: string };
		Body: Ruleset & { name: string; version: number };
	}>(
		"/api/v1/rulesets/:id",
		{
			schema: contract("updateRuleset", rulesetSchema, {
				body: obj({
					...rulesetFields,
					version: { type: "integer", minimum: 1 },
				}),
			}),
		},
		(req) => saveRuleset(req.user.id, req.body, req.params.id),
	);

	app.delete<{ Params: { id: string } }>(
		"/api/v1/rulesets/:id",
		{ schema: contract("deleteRuleset", { type: "null" }, {}, 204) },
		async (req, reply) => {
			try {
				const deleted = await prisma.permissionRuleset.deleteMany({
					where: { id: req.params.id, userId: req.user.id },
				});

				if (!deleted.count) fail(404, "NOT_FOUND", "Ruleset not found");
			} catch (error) {
				if ((error as { code?: string }).code === "P2003")
					fail(
						409,
						"RULESET_IN_USE",
						"Choose another ruleset for its calendar shares and active links before deleting this one",
					);

				throw error;
			}

			return reply.code(204).send();
		},
	);

	app.post<{
		Params: { id: string; userId: string };
		Body: PageQuery & { rulesetId: string; start: string; end: string };
	}>(
		"/api/v1/calendars/:id/grants/:userId/previews",
		{
			schema: contract("previewGrant", list(previewEventSchema), {
				body: obj(
					{ rulesetId: str, start: date, end: date, ...pageQuery },
					["rulesetId", "start", "end"],
				),
			}),
		},
		async (req) => {
			if (
				!(await prisma.calendar.findFirst({
					where: { id: req.params.id, userId: req.user.id },
					select: { id: true },
				}))
			)
				fail(403, "FORBIDDEN", "Calendar ownership required");

			const from = new Date(req.body.start),
				to = new Date(req.body.end);

			if (to <= from || +to - +from > 366 * 86400000)
				fail(
					400,
					"INVALID_INTERVAL",
					"Choose an interval of up to 366 days",
				);

			const mask = await eventAccess(
				req.params.id,
				req.params.userId,
				"full",
				req.body.rulesetId,
			);

			return visiblePage(
				req.body,
				(after, take) =>
					prisma.event.findMany({
						where: {
							calendarId: req.params.id,
							id: after ? { gt: after } : undefined,
							startTime: { lt: to },
							endTime: { gt: from },
						},
						take,
						orderBy: { id: "asc" },
					}),
				async (rows) =>
					rows.flatMap((event) => {
						const explanation = mask.explain(event);

						return [
							{
								...event,
								visibility: explanation.visibility,
								explanation,
							},
						];
					}),
			);
		},
	);
};

export default routes;
