import * as client from "../../lib/generated/client";
import { allPages } from "../../lib/pages";

export function eventInterval(date = new Date()) {
	const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
	const end = new Date(date.getFullYear(), date.getMonth() + 2, 1);
	return { start: start.toISOString(), end: end.toISOString() };
}

export const calendarsApi = {
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
		let run = await client.submitSync({ id });

		for (
			let i = 0;
			i < 180 && (run.status === "queued" || run.status === "running");
			i++
		) {
			await new Promise((resolve) => setTimeout(resolve, 1000));
			run = await client.syncRun({ id: run.id });
		}

		if (run.status === "failed")
			throw new Error(run.error || "Sync failed");

		if (run.status !== "succeeded")
			throw new Error(
				"Sync is still running. Check its status again shortly.",
			);

		return { success: true, eventsSynced: run.eventsSynced };
	},
};
