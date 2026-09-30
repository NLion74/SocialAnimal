import * as client from "../../lib/generated/client";
import { allPages } from "../../lib/pages";

export const sharingApi = {
	set: (body: {
		calendarId: string;
		friendId: string;
		share: boolean;
		permission?: "busy" | "titles" | "full";
	}) =>
		body.share
			? client.setGrant({
					id: body.calendarId,
					userId: body.friendId,
					body: { permission: body.permission || "full" },
				})
			: client.removeGrant({
					id: body.calendarId,
					userId: body.friendId,
				}),
	list: (id: string) =>
		allPages((cursor) => client.subscriptions({ id, cursor })),
	create: (id: string) =>
		client.createSubscription({ id, body: { ceiling: "full" } }),
	revoke: (id: string) => client.revokeSubscription({ id }),
};
