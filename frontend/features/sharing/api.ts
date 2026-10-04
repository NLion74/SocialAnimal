import * as client from "../../lib/generated/client";
import { allPages } from "../../lib/pages";

export const sharingApi = {
	set: (body: {
		calendarId: string;
		friendId: string;
		share: boolean;
		rulesetId: string;
		expiresAt?: string | null;
	}) =>
		body.share
			? client.setGrant({
					id: body.calendarId,
					userId: body.friendId,
					body: {
						rulesetId: body.rulesetId,
						expiresAt: body.expiresAt,
					},
				})
			: client.removeGrant({
					id: body.calendarId,
					userId: body.friendId,
				}),
	list: (id: string) =>
		allPages((cursor) => client.subscriptions({ id, cursor })),
	create: (id: string, body: client.createSubscriptionInput["body"]) =>
		client.createSubscription({ id, body }),
	update: (id: string, body: client.updateSubscriptionInput["body"]) =>
		client.updateSubscription({ id, body }),
	preview: (body: client.sharedCalendarPreviewInput["body"]) =>
		client.sharedCalendarPreview({ body }),
	remove: (id: string) => client.revokeSubscription({ id, permanent: true }),
	revoke: (id: string) => client.revokeSubscription({ id }),
};
