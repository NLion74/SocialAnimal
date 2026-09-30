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
	fail,
} from "../../core/http";
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

	app.post<{ Params: { id: string }; Body: { ceiling: SharePermission } }>(
		"/api/v1/calendars/:id/subscriptions",
		{
			preHandler: authenticateToken,
			schema: contract(
				"createSubscription",
				obj({ ...subscription.properties, url: str }),
				{ body: obj({ ceiling: permissionSchema }) },
				201,
			),
		},
		async (req, reply) => {
			const permission = await access(req.params.id, req.user.id);
			const token = opaqueToken();

			const row = await prisma.subscription.create({
				data: {
					calendarId: req.params.id,
					issuerId: req.user.id,
					tokenHash: tokenHash(token),
					ceiling: ceiling(permission, req.body.ceiling),
				},
			});

			reply.header("Cache-Control", "no-store");

			return reply.code(201).send({
				...row,
				url: `${process.env.PUBLIC_URL || "http://localhost:3000"}/feeds/${token}.ics`,
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

	app.get<{ Params: { token: string } }>(
		"/feeds/:token.ics",
		async (req, reply) => {
			reply.header("Cache-Control", "no-store");

			const row = await prisma.subscription.findUnique({
				where: { tokenHash: tokenHash(req.params.token) },
			});

			if (!row || row.revokedAt)
				return fail(
					404,
					"FEED_UNAVAILABLE",
					"Subscription unavailable",
				);

			const permission = ceiling(
				await access(row.calendarId, row.issuerId),
				row.ceiling,
			);

			const events = await prisma.event.findMany({
				where: { calendarId: row.calendarId },
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
