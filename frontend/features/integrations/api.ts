import { allPages } from "../../lib/pages";
import * as client from "../../lib/generated/client";

export type Credentials = client.createConnectionInput["body"]["credentials"];

export const integrationsApi = {
	providers: client.providers,
	create: (
		type: client.createConnectionInput["body"]["type"],
		name: string,
		credentials: Credentials,
	) => client.createConnection({ body: { type, name, credentials } }),
	update: (id: string, credentials: Credentials) =>
		client.updateConnection({ id, body: { credentials } }),
	test: (id: string) => client.testConnection({ id }),
	discover: (id: string) =>
		allPages((cursor) =>
			client.discoverConnection({ id, cursor, limit: 500 }),
		),
	import: (
		connectionId: string,
		remoteId: string,
		name: string,
		syncInterval?: number,
	) =>
		client.importCalendar({
			body: { connectionId, remoteId, name, syncInterval },
		}),
	authorizeGoogle: client.googleAuthorization,
	googleFlow: async (flow: string) => {
		const result = await client.connections({ flow });
		if (!result.items[0]) throw new Error("Authorization flow expired");
		return result.items[0];
	},
};
