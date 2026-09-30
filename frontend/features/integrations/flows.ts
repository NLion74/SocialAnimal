import { integrationsApi, type Credentials } from "./api";
import { calendarsApi } from "../calendars/api";

export const integrationFlows = {
	connectServer: async (
		type: "caldav" | "icloud",
		name: string,
		credentials: Credentials,
	) => {
		const connection = await integrationsApi.create(
			type,
			name || type,
			credentials,
		);

		const calendars = await integrationsApi.discover(connection.id);
		return { connection, calendars };
	},

	googleDiscovery: async (flow: string) => {
		const connection = await integrationsApi.googleFlow(flow);
		const calendars = await integrationsApi.discover(connection.id);
		return { connection, calendars };
	},

	importSelection: async (
		connectionId: string,
		calendars: Array<{ remoteId: string; name: string }>,
		syncInterval: number,
	) => {
		for (const calendar of calendars) {
			await integrationsApi.import(
				connectionId,
				calendar.remoteId,
				calendar.name,
				syncInterval,
			);
		}
	},

	importDirectCaldav: async (
		name: string,
		credentials: Credentials,
		syncInterval: number,
	) => {
		const connection = await integrationsApi.create(
			"caldav",
			name,
			credentials,
		);

		return integrationsApi.import(
			connection.id,
			credentials.url!,
			name,
			syncInterval,
		);
	},

	saveFeed: async (input: {
		calendarId?: string;
		connectionId?: string | null;
		name: string;
		credentials: Credentials;
		syncInterval: number;
	}) => {
		const { name, credentials, syncInterval } = input;

		const connectionId =
			input.connectionId ||
			(await integrationsApi.create("ics", name, credentials)).id;

		if (input.calendarId)
			await integrationsApi.update(connectionId, credentials);

		await integrationsApi.test(connectionId);

		if (input.calendarId)
			return calendarsApi.update(input.calendarId, {
				name,
				syncInterval,
			});

		return integrationsApi.import(connectionId, "feed", name, syncInterval);
	},
};
