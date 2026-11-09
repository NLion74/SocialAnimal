import type { FastifyPluginAsync } from "fastify";
import { authenticateToken } from "../identity";
import {
	contract,
	obj,
	str,
	array,
	nullableString,
	list,
	page,
	pageQuery,
	type PageQuery,
	fail,
} from "../../core/http";
import * as ops from "./operations";

const user = obj({ id: str, email: str, name: nullableString });

const permission = { type: "string", enum: ["busy", "titles", "full"] };

const friendship = obj(
	{
		id: str,
		user1: user,
		user2: user,
		status: str,
		sharedCalendarIds: array(str),
		sharedCalendarExpirations: {
			type: "object",
			additionalProperties: { type: ["string", "null"] },
		},
		sharedCalendarRulesets: { type: "object", additionalProperties: str },
		sharedCalendarPermissions: {
			type: "object",
			additionalProperties: permission,
		},
		sharedWithMe: array(
			obj({ id: str, name: str, permission, accessLabel: str }),
		),
	},
	["id", "status", "user1", "user2"],
);

const routes: FastifyPluginAsync = async (app) => {
	app.addHook("preHandler", authenticateToken);

	app.get<{ Querystring: PageQuery & { query: string } }>(
		"/users",
		{
			schema: contract("searchUsers", list(user), {
				querystring: obj(
					{
						...pageQuery,
						query: { type: "string", minLength: 2, maxLength: 100 },
					},
					["query"],
				),
			}),
		},
		async (req) =>
			page(
				await ops.searchUsersByUsername(
					req.user.id,
					req.query.query,
					req.query,
				),
				req.query,
			),
	);

	app.get<{ Querystring: PageQuery }>(
		"/friendships",
		{
			schema: contract("friendships", list(friendship), {
				querystring: obj(pageQuery, []),
			}),
		},
		async (req) =>
			page(
				await ops.listFriendshipsWithShares(req.user.id, req.query),
				req.query,
			),
	);

	app.post<{ Body: { targetUserId?: string; identifier?: string } }>(
		"/friendships",
		{
			schema: contract(
				"requestFriendship",
				friendship,
				{
					body: {
						...obj({ targetUserId: str, identifier: str }, []),
						anyOf: [
							{ required: ["targetUserId"] },
							{ required: ["identifier"] },
						],
					},
				},
				201,
			),
		},
		async (req, reply) => {
			const result = req.body.targetUserId
				? await ops.requestFriendByUserId(
						req.user.id,
						req.body.targetUserId,
					)
				: await ops.requestFriend(req.user.id, req.body.identifier!);

			if (typeof result === "string")
				return fail(
					result === "not-found" ? 404 : 409,
					"FRIENDSHIP_FAILED",
					result,
				);

			return reply.code(201).send(result);
		},
	);

	app.patch<{ Params: { id: string }; Body: { status: "accepted" } }>(
		"/friendships/:id",
		{
			schema: contract("acceptFriendship", friendship, {
				body: obj({ status: { type: "string", enum: ["accepted"] } }),
			}),
		},
		async (req) => {
			const result = await ops.acceptFriendRequest(
				req.user.id,
				req.params.id,
			);

			if (!result)
				return fail(404, "NOT_FOUND", "Pending request not found");

			return result;
		},
	);

	app.delete<{ Params: { id: string } }>(
		"/friendships/:id",
		{ schema: contract("removeFriendship", { type: "null" }, {}, 204) },
		async (req, reply) => {
			if (!(await ops.removeFriendship(req.user.id, req.params.id)))
				fail(404, "NOT_FOUND", "Friendship not found");

			return reply.code(204).send();
		},
	);
};

export default routes;
