import * as client from "../../lib/generated/client";
import { waitForSync } from "./sync-status";
import { allPages } from "../../lib/pages";

export function eventInterval(date = new Date()) {
	const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
	const end = new Date(date.getFullYear(), date.getMonth() + 2, 1);
	return { start: start.toISOString(), end: end.toISOString() };
}

export const calendarsApi = {
	sources: () =>
		allPages((cursor) => client.calendarSources({ cursor, limit: 500 })),
	setColor: (
		id: string,
		color: client.setCalendarColorInput["body"]["color"],
	) => client.setCalendarColor({ id, body: { color } }),
	resetColor: (id: string) => client.resetCalendarColor({ id }),
	list: () => allPages((cursor) => client.calendars({ cursor, limit: 500 })),
	events: (scope: "mine" | "shared" | "all" = "mine", date?: Date) =>
		allPages((cursor) =>
			client.events({
				scope,
				...eventInterval(date),
				cursor,
				limit: 500,
			}),
		),
	update: (id: string, body: client.updateCalendarInput["body"]) =>
		client.updateCalendar({ id, body }),
	remove: (id: string) => client.deleteCalendar({ id }),
	sync: async (id: string) => {
		const run = await client.submitSync({ id });
		return waitForSync(run, (runId) => client.syncRun({ id: runId }));
	},
};
