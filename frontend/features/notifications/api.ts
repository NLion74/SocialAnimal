import * as client from "../../lib/generated/client";
import { allPages } from "../../lib/pages";

export const notificationsApi = {
	list: () =>
		allPages((cursor) => client.notifications({ cursor, limit: 100 })),
	attention: client.attention,
	read: (id: string, read = true) =>
		client.readNotification({ id, body: { read } }),
	settings: client.notificationSettings,
	updateSettings: (body: client.updateNotificationSettingsInput["body"]) =>
		client.updateNotificationSettings({ body }),
};
