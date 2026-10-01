import type { FastifyPluginAsync } from "fastify";
import type { SharePermission } from "@prisma/client";
import ical from "ical-generator";
import { prisma } from "../../core/database";
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
import { subscriptionAccess } from "./subscriptions";
import { authenticateToken } from "../identity";
import {
	access,
	ceiling,
	maskEvent,
	permissionSchema,
	setGrant,
} from "./authorization";

const subscription = obj({
	id: str,
	calendarId: str,
	ceiling: permissionSchema,
	createdAt: date,
	revokedAt: nullableString,
});

const routes: FastifyPluginAsync = async (app) => {
	app.put<{
		Params: { id: string; userId: string };
		Body: { permission: SharePermission };
	}>(
		"/api/v1/calendars/:id/grants/:userId",
		{
			preHandler: authenticateToken,
			schema: contract(
				"setGrant",
				{ type: "null" },
				{ body: obj({ permission: permissionSchema }) },
				204,
			),
		},
		async (req, reply) => {
			await setGrant(
				req.user.id,
				req.params.userId,
				req.params.id,
				req.body.permission,
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
		Body: { ceiling: SharePermission; replaceId?: string };
	}>(
		"/api/v1/calendars/:id/subscriptions",
		{
			preHandler: authenticateToken,
			schema: contract(
				"createSubscription",
				obj({ ...subscription.properties, url: str, previewUrl: str }),
				{
					body: obj({ ceiling: permissionSchema, replaceId: str }, [
						"ceiling",
					]),
				},
				201,
			),
		},
		async (req, reply) => {
			const token = opaqueToken();

			const row = await prisma.$transaction(async (tx) => {
				const permission = await access(req.params.id, req.user.id, tx);

				if (req.body.replaceId) {
					const replaced = await tx.subscription.updateMany({
						where: {
							id: req.body.replaceId,
							calendarId: req.params.id,
							issuerId: req.user.id,
							revokedAt: null,
						},
						data: { revokedAt: new Date() },
					});

					if (!replaced.count)
						fail(404, "NOT_FOUND", "Active subscription not found");
				}

				return tx.subscription.create({
					data: {
						calendarId: req.params.id,
						issuerId: req.user.id,
						tokenHash: tokenHash(token),
						ceiling: ceiling(permission, req.body.ceiling),
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

	app.delete<{ Params: { id: string } }>(
		"/api/v1/subscriptions/:id",
		{
			preHandler: authenticateToken,
			schema: contract("revokeSubscription", { type: "null" }, {}, 204),
		},
		async (req, reply) => {
			const result = await prisma.subscription.updateMany({
				where: { id: req.params.id, issuerId: req.user.id },
				data: { revokedAt: new Date() },
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

			const { calendarId, permission } = await subscriptionAccess(
				req.body.token,
			);
			const calendar = await prisma.calendar.findUniqueOrThrow({
				where: { id: calendarId },
				select: { name: true },
			});

			const events = await prisma.event.findMany({
				where: {
					calendarId,
					startTime: { lt: to },
					endTime: { gt: from },
				},
				...pageArgs(req.body),
			});

			return {
				name: permission === "busy" ? "Shared calendar" : calendar.name,
				permission,
				...page(
					events.map((event) => maskEvent(event, permission)),
					req.body,
				),
			};
		},
	);

	app.get<{ Params: { token: string } }>(
		"/feeds/:token.ics",
		async (req, reply) => {
			reply.header("Cache-Control", "no-store");

			const { calendarId, permission } = await subscriptionAccess(
				req.params.token,
			);

			const events = await prisma.event.findMany({
				where: { calendarId },
				orderBy: { startTime: "asc" },
			});

			const feed = ical({ name: "SocialAnimal" });

			for (const raw of events) {
				const event = maskEvent(raw, permission);

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
