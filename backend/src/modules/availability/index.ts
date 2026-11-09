import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../core/database";
import {
	contract,
	obj,
	str,
	date,
	array,
	bool,
	integer,
	fail,
} from "../../core/http";
import { authenticateToken } from "../identity";
import { eventAccess, visibility } from "../sharing";
import { dailyWindows, suggestedTimes } from "../../services/availability";

const dateOnly = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const clockTime = {
	type: "string",
	pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$",
};

const routes: FastifyPluginAsync = async (app) => {
	app.addHook("preHandler", authenticateToken);

	app.post<{
		Body: {
			friendIds: string[];
			calendarIds?: string[];
			start: string;
			end: string;
			from: string;
			to: string;
			minutes: number;
			includeAllDay?: boolean;
		};
	}>(
		"/availability/searches",
		{
			schema: contract(
				"findTime",
				obj({
					timezone: str,
					allDayEvents: integer,
					items: array(obj({ start: date, end: date })),
					notices: array(obj({ userId: str, message: str })),
				}),
				{
					body: obj(
						{
							friendIds: {
								...array(str),
								minItems: 1,
								maxItems: 10,
								uniqueItems: true,
							},
							calendarIds: {
								...array(str),
								maxItems: 250,
								uniqueItems: true,
							},
							start: dateOnly,
							end: dateOnly,
							from: clockTime,
							to: clockTime,
							minutes: {
								type: "integer",
								minimum: 15,
								maximum: 720,
							},
							includeAllDay: { ...bool, default: true },
						},
						["friendIds", "start", "end", "from", "to", "minutes"],
					),
				},
			),
		},
		async (req) => {
			const userId = req.user.id;
			const { friendIds, start, end, from, to, minutes } = req.body;
			const includeAllDay = req.body.includeAllDay ?? true;
			const preferences = await prisma.userSettings.findUnique({
				where: { userId },
			});
			const timezone = preferences?.timezone || "UTC";
			let windows;

			try {
				windows = dailyWindows(start, end, from, to, timezone);
			} catch {
				return fail(
					400,
					"INVALID_INTERVAL",
					"Choose valid dates within 31 days and an end time after the start time.",
				);
			}

			const friends = await prisma.friendship.findMany({
				where: {
					status: "accepted",
					OR: [
						{ user1Id: userId, user2Id: { in: friendIds } },
						{ user2Id: userId, user1Id: { in: friendIds } },
					],
				},
			});
			if (friends.length !== friendIds.length)
				return fail(403, "NOT_FRIENDS", "Select accepted friends.");

			const { calendarIds } = req.body;
			if (calendarIds?.length) {
				const owned = await prisma.calendar.count({
					where: { userId, id: { in: calendarIds } },
				});
				if (owned !== calendarIds.length)
					return fail(
						403,
						"FORBIDDEN",
						"Select calendars you own. A selected calendar may have been removed.",
					);
			}

			const calendars = await prisma.calendar.findMany({
				where: {
					OR: [
						{
							userId,
							...(calendarIds ? { id: { in: calendarIds } } : {}),
						},
						{
							AND: [
								visibility(userId, "shared"),
								{ userId: { in: friendIds } },
							],
						},
					],
				},
				take: 251,
			});
			if (calendars.length > 250)
				return fail(422, "SEARCH_TOO_LARGE", "Select fewer friends.");

			const notices: Array<{ userId: string; message: string }> = [];
			for (const person of [userId, ...friendIds]) {
				// An explicitly empty selection means the caller chose not to check their calendars.
				if (person === userId && calendarIds?.length === 0) continue;
				const selected = calendars.filter(
					(calendar) => calendar.userId === person,
				);
				if (!selected.length)
					notices.push({
						userId: person,
						message:
							person === userId
								? "Add and sync a calendar before searching so your availability can be checked."
								: "This friend has no active calendar shares with you. Ask them to share a calendar or renew their share.",
					});
				else if (
					selected.some(
						(calendar) =>
							calendar.lastError ||
							!calendar.lastSuccess ||
							!calendar.coverageStart ||
							!calendar.coverageEnd ||
							calendar.coverageStart > windows[0].start ||
							calendar.coverageEnd < windows.at(-1)!.end,
					)
				)
					notices.push({
						userId: person,
						message:
							"Calendar data is incomplete or a sync needs attention. Sync the calendars or choose another date range.",
					});
			}
			if (notices.length)
				return { timezone, items: [], notices, allDayEvents: 0 };

			const busy: Array<{ start: Date; end: Date }> = [];
			let count = 0;
			let allDayEvents = 0;
			for (const calendar of calendars) {
				const mask = await eventAccess(calendar.id, userId);
				const events = await prisma.event.findMany({
					where: {
						calendarId: calendar.id,
						startTime: { lt: windows.at(-1)!.end },
						endTime: { gt: windows[0].start },
					},
					take: 10001 - count,
				});
				count += events.length;
				if (count > 10000)
					return fail(
						422,
						"SEARCH_TOO_LARGE",
						"Choose a shorter date range or fewer friends.",
					);
				for (const event of events) {
					if (event.blocksTime === false || !mask(event)) continue;
					if (event.allDay) {
						allDayEvents++;
						if (!includeAllDay) continue;
					}
					busy.push({ start: event.startTime, end: event.endTime });
				}
			}

			return {
				timezone,
				allDayEvents,
				items: suggestedTimes(windows, busy, minutes),
				notices,
			};
		},
	);
};

export default routes;
