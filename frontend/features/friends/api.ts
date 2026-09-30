import * as client from "../../lib/generated/client";
import { allPages } from "../../lib/pages";

export const friendsApi = {
	list: () =>
		allPages((cursor) => client.friendships({ cursor, limit: 500 })),
	request: (body: client.requestFriendshipInput["body"]) =>
		client.requestFriendship({ body }),
	accept: (id: string) =>
		client.acceptFriendship({ id, body: { status: "accepted" } }),
	remove: (id: string) => client.removeFriendship({ id }),
	search: (query: string) =>
		client.searchUsers({ query }).then((r) => r.items),
};
