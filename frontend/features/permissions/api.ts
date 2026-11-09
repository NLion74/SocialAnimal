import * as client from "../../lib/generated/client";
import { allPages } from "../../lib/pages";

export type Ruleset = client.rulesetsResponse["items"][number];

export type Condition = client.PermissionCondition;

export type Visibility = Ruleset["fallback"];

export const permissionsApi = {
	registry: client.permissionRegistry,
	list: () => allPages((cursor) => client.rulesets({ cursor })),
	create: (body: client.createRulesetInput["body"]) =>
		client.createRuleset({ body }),
	update: (id: string, body: client.updateRulesetInput["body"]) =>
		client.updateRuleset({ id, body }),
	remove: (id: string) => client.deleteRuleset({ id }),
	preview: (
		id: string,
		userId: string,
		body: client.previewGrantInput["body"],
	) => client.previewGrant({ id, userId, body }),
};
