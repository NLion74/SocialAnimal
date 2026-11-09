import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../core/database";
import { access, visibility } from "../sharing";
import {
	contract,
	obj,
	str,
	bool,
	list,
	page,
	pageArgs,
	pageQuery,
	type PageQuery,
} from "../../core/http";

export const calendarColors = [
	"blue",
	"green",
	"teal",
	"amber",
	"rose",
	"violet",
	"slate",
] as const;
export const colorSchema = { type: "string", enum: [...calendarColors] };

const routes: FastifyPluginAsync = async (app) => {
	app.get<{ Querystring: PageQuery }>(
		"/calendar-sources",
		{
			schema: contract(
				"calendarSources",
				list(
					obj({
						id: str,
						name: str,
						color: colorSchema,
						defaultColor: colorSchema,
						timezone: str,
						isFriend: bool,
					}),
				),
				{ querystring: obj(pageQuery, []) },
			),
		},
		async (req) => {
			const calendars = await prisma.calendar.findMany({
				where: visibility(req.user.id),
				include: {
					viewerColors: { where: { userId: req.user.id } },
					user: {
						select: {
							name: true,
							email: true,
							settings: { select: { timezone: true } },
						},
					},
				},
				...pageArgs(req.query),
			});
			return page(
				calendars.map((calendar) => ({
					id: calendar.id,
					name:
						calendar.userId === req.user.id
							? calendar.name
							: `${calendar.user.name || calendar.user.email} — ${calendar.name}`,
					color: calendar.viewerColors[0]?.color || calendar.color,
					defaultColor: calendar.color,
					timezone: calendar.user.settings?.timezone || "UTC",
					isFriend: calendar.userId !== req.user.id,
				})),
				req.query,
			);
		},
	);

	app.put<{ Params: { id: string }; Body: { color: string } }>(
		"/me/calendar-colors/:id",
		{
			schema: contract("setCalendarColor", obj({ color: colorSchema }), {
				body: obj({ color: colorSchema }),
			}),
		},
		async (req) => {
			await access(req.params.id, req.user.id);
			return prisma.calendarColor.upsert({
				where: {
					userId_calendarId: {
						userId: req.user.id,
						calendarId: req.params.id,
					},
				},
				create: {
					userId: req.user.id,
					calendarId: req.params.id,
					color: req.body.color,
				},
				update: { color: req.body.color },
			});
		},
	);

	app.delete<{ Params: { id: string } }>(
		"/me/calendar-colors/:id",
		{ schema: contract("resetCalendarColor", { type: "null" }, {}, 204) },
		async (req, reply) => {
			await prisma.calendarColor.deleteMany({
				where: { userId: req.user.id, calendarId: req.params.id },
			});
			return reply.code(204).send();
		},
	);
};

export default routes;
