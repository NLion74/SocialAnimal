import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../core/database";
import { authenticateToken } from "../identity";
import { maskEvent, visibility, permissionFor } from "../sharing";
import { submitSync } from "../integrations";
import {
	contract,
	obj,
	str,
	date,
	pageQuery,
	pageArgs,
	page,
	list,
	type PageQuery,
	fail,
} from "../../core/http";
import { calendarSchema, eventSchema, syncSchema } from "./schemas";

async function owned(id: string, userId: string) {
	if (
		!(await prisma.calendar.findFirst({
			where: { id, userId },
			select: { id: true },
		}))
	)
		fail(403, "FORBIDDEN", "Calendar ownership required");
}

const routes: FastifyPluginAsync = async (app) => {
	app.addHook("preHandler", authenticateToken);

	app.get<{ Querystring: PageQuery }>(
		"/calendars",
		{
			schema: contract("calendars", list(calendarSchema), {
				querystring: obj(pageQuery, []),
			}),
		},
		async (req) =>
			page(
				(
					await prisma.calendar.findMany({
						where: { userId: req.user.id },
						include: { _count: { select: { events: true } } },
						...pageArgs(req.query),
					})
				).map(({ _count, ...calendar }) => ({
					...calendar,
					eventCount: _count.events,
				})),
				req.query,
			),
	);

	app.patch<{
		Params: { id: string };
		Body: { name?: string; syncInterval?: number };
	}>(
		"/calendars/:id",
		{
			schema: contract("updateCalendar", calendarSchema, {
				body: obj(
					{
						name: { type: "string", minLength: 1, maxLength: 200 },
						syncInterval: {
							type: "integer",
							minimum: 0,
							maximum: 525600,
						},
					},
					[],
				),
			}),
		},
		async (req) => {
			await owned(req.params.id, req.user.id);

			return prisma.calendar.update({
				where: { id: req.params.id },
				data: req.body,
			});
		},
	);

	app.delete<{ Params: { id: string } }>(
		"/calendars/:id",
		{ schema: contract("deleteCalendar", { type: "null" }, {}, 204) },
		async (req, reply) => {
			await owned(req.params.id, req.user.id);
			await prisma.calendar.delete({ where: { id: req.params.id } });
			return reply.code(204).send();
		},
	);

	app.get<{
		Querystring: PageQuery & {
			start: string;
			end: string;
			calendarId?: string;
			scope?: "mine" | "shared" | "all";
		};
	}>(
		"/events",
		{
			schema: contract("events", list(eventSchema), {
				querystring: obj(
					{
						...pageQuery,
						start: date,
						end: date,
						calendarId: str,
						scope: {
							type: "string",
							enum: ["mine", "shared", "all"],
							default: "all",
						},
					},
					["start", "end"],
				),
			}),
		},
		async (req) => {
			const { start, end, calendarId, scope } = req.query;

			const from = new Date(start),
				to = new Date(end);

			if (to <= from || to.getTime() - from.getTime() > 366 * 86400000)
				return fail(
					400,
					"INVALID_INTERVAL",
					"Event interval must be positive and at most 366 days",
				);

			const userId = req.user.id;

			const rows = await prisma.event.findMany({
				where: {
					calendarId,
					calendar: visibility(userId, scope),
					startTime: { lt: to },
					endTime: { gt: from },
				},
				include: {
					calendar: {
						include: {
							shares: { where: { sharedWithId: userId } },
							user: {
								select: { id: true, name: true, email: true },
							},
						},
					},
				},
				...pageArgs(req.query),
			});

			return page(
				rows.map((e) => ({
					...maskEvent(e, permissionFor(e.calendar, userId)),
					isFriend: e.calendar.userId !== userId,
					owner: e.calendar.user,
				})),
				req.query,
			);
		},
	);

	app.post<{ Params: { id: string } }>(
		"/calendars/:id/sync-runs",
		{ schema: contract("submitSync", syncSchema, {}, 202) },
		async (req, reply) => {
			await owned(req.params.id, req.user.id);
			const run = await submitSync(req.params.id);
			const statusUrl = `/api/v1/sync-runs/${run.id}`;

			return reply
				.code(202)
				.header("Location", statusUrl)
				.send({ ...run, statusUrl });
		},
	);

	app.get<{ Params: { id: string } }>(
		"/sync-runs/:id",
		{ schema: contract("syncRun", syncSchema) },
		async (req) => {
			const run = await prisma.syncRun.findFirst({
				where: { id: req.params.id, calendar: { userId: req.user.id } },
			});

			if (!run) return fail(404, "NOT_FOUND", "Sync run not found");
			return run;
		},
	);
};

export default routes;
