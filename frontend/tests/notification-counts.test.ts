import { it, expect } from "vitest";
import { notificationCount } from "../features/notifications/NotificationProvider";

it("counts active tasks once and separately from unread updates", () => {
	const task = {
		id: "syncFailure:calendar",
		title: "Sync failed",
		href: "/dashboard",
		tab: "calendar",
	};
	const update = {
		id: "update",
		title: "Sync failed",
		href: "/dashboard",
		tab: "calendar",
		active: true,
		readAt: null,
		createdAt: "2027-01-01T00:00:00Z",
	};
	expect(notificationCount([update], [task])).toBe(1);
	expect(
		notificationCount(
			[{ ...update, readAt: "2027-01-01T01:00:00Z" }],
			[task],
		),
	).toBe(1);
	expect(notificationCount([{ ...update, active: false }], [task])).toBe(2);
	expect(notificationCount([update], [task], "friends")).toBe(0);
});
