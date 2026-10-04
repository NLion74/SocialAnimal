import { visiblePage } from "../../core/http/visible-page";
import type { FastifyPluginAsync } from "fastify";
import type { SharePermission } from "@prisma/client";
import ical from "ical-generator";
import { prisma, type Prisma } from "../../core/database";
import { opaqueToken, tokenHash } from "../../core/secrets";
import {
	contract,
	obj,
	str,
	date,
	nullableString,
	list,
	pageArgs,
	page,
	pageQuery,
	type PageQuery,
	bool,
	fail,
} from "../../core/http";
import ruleRoutes from "./rule-routes";
import { eventAccess } from "./event-access";
import { subscriptionAccess } from "./subscriptions";
import { authenticateToken } from "../identity";
import { access, ceiling, permissionSchema, setGrant } from "./authorization";

const expirySchema = { type: ["string", "null"], format: "date-time" };

function expiration(value?: string | null) {
	if (value && new Date(value) <= new Date())
		fail(400, "INVALID_EXPIRATION", "Choose a future expiration");

	return value === undefined ? undefined : value ? new Date(value) : null;
}

const subscription = obj({
	expiresAt: nullableString,
	name: str,
	rulesetId: nullableString,
	id: str,
	calendarId: str,
	ceiling: permissionSchema,
	createdAt: date,
	revokedAt: nullableString,
});

const routes: FastifyPluginAsync = async (app) => {
	await app.register(ruleRoutes);

	app.put<{
		Params: { id: string; userId: string };
		Body: { rulesetId: string; expiresAt?: string | null };
	}>(
		"/api/v1/calendars/:id/grants/:userId",
		{
			preHandler: authenticateToken,
			schema: contract(
				"setGrant",
				{ type: "null" },
				{
					body: obj({ rulesetId: str, expiresAt: expirySchema }, [
						"rulesetId",
					]),
				},
				204,
			),
		},
		async (req, reply) => {
			await setGrant(
				req.user.id,
				req.params.userId,
				req.params.id,
				req.body.rulesetId,
				req.body.expiresAt,
			);

			return reply.code(204).send();
		},
	);

	app.delete<{ Params: { id: string; userId: string } }>(
		"/api/v1/calendars/:id/grants/:userId",
		{
			preHandler: authenticateToken,
			schema: contract("removeGrant", { type: "null" }, {}, 204),
		},
		async (req, reply) => {
			await setGrant(req.user.id, req.params.userId, req.params.id);
			return reply.code(204).send();
		},
	);

	app.get<{ Params: { id: string }; Querystring: PageQuery }>(
		"/api/v1/calendars/:id/subscriptions",
		{
			preHandler: authenticateToken,
			schema: contract("subscriptions", list(subscription), {
				querystring: obj(pageQuery, []),
			}),
		},
		async (req) => {
			await access(req.params.id, req.user.id);

			return page(
				await prisma.subscription.findMany({
					where: { calendarId: req.params.id, issuerId: req.user.id },
					...pageArgs(req.query),
				}),
				req.query,
			);
		},
	);

	app.post<{
		Params: { id: string };
		Body: {
			ceiling?: SharePermission;
			replaceId?: string;
			name?: string;
			rulesetId?: string;
			expiresAt?: string | null;
		};
	}>(
		"/api/v1/calendars/:id/subscriptions",
		{
			preHandler: authenticateToken,
			schema: contract(
				"createSubscription",
				obj({ ...subscription.properties, url: str, previewUrl: str }),
				{
					body: {
						...obj(
							{
								ceiling: permissionSchema,
								replaceId: str,
								name: { ...str, minLength: 1, maxLength: 100 },
								rulesetId: str,
								expiresAt: expirySchema,
							},
							[],
						),
						anyOf: [
							{ required: ["ceiling"] },
							{ required: ["rulesetId"] },
						],
					},
				},
				201,
			),
		},
		async (req, reply) => {
			const token = opaqueToken();

			const row = await prisma.$transaction(async (tx) => {
				const permission = await access(req.params.id, req.user.id, tx);

				if (req.body.rulesetId)
					await ownedRuleset(tx, req.body.rulesetId, req.user.id);

				if (req.body.replaceId) {
					const replaced = await tx.subscription.updateMany({
						where: {
							id: req.body.replaceId,
							calendarId: req.params.id,
							issuerId: req.user.id,
							revokedAt: null,
						},
						data: { revokedAt: new Date(), rulesetId: null },
					});

					if (!replaced.count)
						fail(404, "NOT_FOUND", "Active subscription not found");
				}

				return tx.subscription.create({
					data: {
						calendarId: req.params.id,
						issuerId: req.user.id,
						tokenHash: tokenHash(token),
						ceiling: req.body.rulesetId
							? "full"
							: ceiling(permission, req.body.ceiling || "full"),
						name: req.body.name?.trim() || "Sharing link",
						rulesetId: req.body.rulesetId,
						expiresAt: expiration(req.body.expiresAt),
					},
				});
			});

			reply.header("Cache-Control", "no-store");

			return reply.code(201).send({
				...row,
				url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/feeds/${token}.ics`,
				previewUrl: `${process.env.PUBLIC_URL || "http://localhost:3000"}/shared#${token}`,
			});
		},
	);

	app.patch<{
		Params: { id: string };
		Body: { name?: string; rulesetId?: string; expiresAt?: string | null };
	}>(
		"/api/v1/subscriptions/:id",
		{
			preHandler: authenticateToken,
			schema: contract("updateSubscription", subscription, {
				body: obj(
					{
						name: { ...str, minLength: 1, maxLength: 100 },
						rulesetId: str,
						expiresAt: expirySchema,
					},
					[],
				),
			}),
		},
		async (req) =>
			prisma.$transaction(async (tx) => {
				const row = await tx.subscription.findFirst({
					where: {
						id: req.params.id,
						issuerId: req.user.id,
						revokedAt: null,
					},
				});

				if (!row)
					return fail(
						404,
						"NOT_FOUND",
						"Active subscription not found",
					);

				await access(row.calendarId, req.user.id, tx);

				if (req.body.rulesetId)
					await ownedRuleset(tx, req.body.rulesetId, req.user.id);

				return tx.subscription.update({
					where: { id: row.id },
					data: {
						name: req.body.name?.trim() || undefined,
						rulesetId: req.body.rulesetId,
						expiresAt: expiration(req.body.expiresAt),
						...(req.body.rulesetId ? { ceiling: "full" } : {}),
						version: { increment: 1 },
					},
				});
			}),
	);

	app.delete<{
		Params: { id: string };
		Querystring: { permanent?: boolean };
	}>(
		"/api/v1/subscriptions/:id",
		{
			preHandler: authenticateToken,
			schema: contract(
				"revokeSubscription",
				{ type: "null" },
				{ querystring: obj({ permanent: { type: "boolean" } }, []) },
				204,
			),
		},
		async (req, reply) => {
			if (req.query.permanent) {
				const deleted = await prisma.subscription.deleteMany({
					where: {
						id: req.params.id,
						issuerId: req.user.id,
						revokedAt: { not: null },
					},
				});

				if (!deleted.count) {
					const own = await prisma.subscription.findFirst({
						where: { id: req.params.id, issuerId: req.user.id },
					});

					if (own)
						fail(
							409,
							"SHARE_ACTIVE",
							"Revoke this sharing link before deleting it.",
						);

					fail(404, "NOT_FOUND", "Subscription not found");
				}

				return reply.code(204).send();
			}

			const result = await prisma.subscription.updateMany({
				where: { id: req.params.id, issuerId: req.user.id },
				data: { revokedAt: new Date(), rulesetId: null },
			});

			if (!result.count) fail(404, "NOT_FOUND", "Subscription not found");
			return reply.code(204).send();
		},
	);

	app.post<{
		Body: PageQuery & { token: string; start: string; end: string };
	}>(
		"/api/v1/shared-calendar-previews",
		{
			schema: contract(
				"sharedCalendarPreview",
				obj({
					name: str,
					timezone: str,
					firstDayOfWeek: {
						type: "string",
						enum: ["monday", "sunday"],
					},
					accessRevision: str,
					permission: permissionSchema,
					...list(
						obj({
							id: str,
							title: str,
							description: nullableString,
							location: nullableString,
							startTime: date,
							endTime: date,
							allDay: bool,
							visibility: {
								type: "string",
								enum: ["full", "titles", "busy"],
							},
						}),
					).properties,
				}),
				{
					body: obj(
						{
							token: {
								type: "string",
								minLength: 1,
								maxLength: 128,
							},
							start: date,
							end: date,
							...pageQuery,
						},
						["token", "start", "end"],
					),
				},
			),
		},
		async (req, reply) => {
			reply.header("Cache-Control", "no-store");
			reply.header("Referrer-Policy", "no-referrer");
			reply.header("X-Robots-Tag", "noindex, nofollow");

			const from = new Date(req.body.start),
				to = new Date(req.body.end);

			if (to <= from || to.getTime() - from.getTime() > 366 * 86400000)
				fail(
					400,
					"INVALID_INTERVAL",
					"Event interval must be positive and at most 366 days",
				);

			const { calendarId, permission, issuerId, ruleset, version } =
				await subscriptionAccess(req.body.token);

			const calendar = await prisma.calendar.findUniqueOrThrow({
				where: { id: calendarId },
				select: {
					name: true,
					user: {
						select: {
							settings: {
								select: {
									timezone: true,
									firstDayOfWeek: true,
								},
							},
						},
					},
				},
			});

			const mask = await eventAccess(
				calendarId,
				issuerId,
				permission,
				undefined,
				ruleset,
			);

			const result = await visiblePage(
				req.body,
				(after, take) =>
					prisma.event.findMany({
						where: {
							calendarId,
							id: after ? { gt: after } : undefined,
							startTime: { lt: to },
							endTime: { gt: from },
						},
						take,
						orderBy: { id: "asc" },
					}),
				async (rows) =>
					rows.flatMap((event) => {
						const visible = mask(event);
						return visible ? [visible] : [];
					}),
			);

			return {
				name:
					ruleset || permission === "busy"
						? "Shared calendar"
						: calendar.name,
				timezone: calendar.user.settings?.timezone || "UTC",
				firstDayOfWeek:
					calendar.user.settings?.firstDayOfWeek || "monday",
				accessRevision: `${version}:${mask.revision}`,
				permission,
				...result,
			};
		},
	);

	app.get<{ Params: { token: string } }>(
		"/feeds/:token.ics",
		async (req, reply) => {
			reply.header("Cache-Control", "no-store");

			const { calendarId, permission, issuerId, ruleset } =
				await subscriptionAccess(req.params.token);

			const events = await prisma.event.findMany({
				where: { calendarId },
				orderBy: { startTime: "asc" },
				take: 50001,
			});

			if (events.length > 50000)
				fail(
					422,
					"FEED_TOO_LARGE",
					"Calendar contains too many events to export.",
				);

			const feed = ical({ name: "SocialAnimal" });

			const mask = await eventAccess(
				calendarId,
				issuerId,
				permission,
				undefined,
				ruleset,
			);

			for (const raw of events) {
				const event = mask(raw);
				if (!event) continue;

				feed.createEvent({
					id: event.id,
					start: event.startTime,
					end: event.endTime,
					allDay: event.allDay,
					summary: event.title,
					description: event.description || undefined,
					location: event.location || undefined,
				});
			}

			return reply
				.type("text/calendar; charset=utf-8")
				.send(feed.toString());
		},
	);
};

export default routes;

async function ownedRuleset(
	tx: Prisma.TransactionClient,
	id: string,
	userId: string,
) {
	if (
		!(await tx.permissionRuleset.findFirst({
			where: { id, userId },
			select: { id: true },
		}))
	)
		fail(404, "NOT_FOUND", "Ruleset not found");
}
