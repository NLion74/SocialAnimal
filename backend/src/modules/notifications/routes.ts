import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../core/database";
import { authenticateToken } from "../identity";
import {
	contract,
	obj,
	str,
	date,
	bool,
	array,
	nullableString,
	pageQuery,
	list,
	type PageQuery,
} from "../../core/http";
import { visiblePage } from "../../core/http/visible-page";
import { present } from "./operations";

const itemSchema = obj({
	id: str,
	title: str,
	href: str,
	tab: str,
	active: bool,
	readAt: nullableString,
	createdAt: date,
});
const preferences = {
	emailFriendRequests: bool,
	emailFriendAccepted: bool,
	emailHighlights: bool,
	emailSyncFailures: bool,
};

const routes: FastifyPluginAsync = async (app) => {
	app.addHook("preHandler", authenticateToken);
	app.get<{ Querystring: PageQuery }>(
		"/me/notifications",
		{
			schema: contract("notifications", list(itemSchema), {
				querystring: obj(pageQuery, []),
			}),
		},
		async (req) =>
			visiblePage(
				req.query,
				(after, take) =>
					prisma.notification.findMany({
						where: {
							userId: req.user.id,
							id: after ? { gt: after } : undefined,
						},
						orderBy: { id: "asc" },
						take,
					}),
				async (rows) =>
					(await Promise.all(rows.map(present))).filter(
						(row) => row !== null,
					),
			),
	);

	app.get(
		"/me/attention",
		{
			schema: contract(
				"attention",
				obj({
					items: array(
						obj({ id: str, title: str, href: str, tab: str }),
					),
				}),
			),
		},
		async (req) => {
			const [user, calendars, requests] = await Promise.all([
				prisma.user.findUniqueOrThrow({
					where: { id: req.user.id },
					select: { emailVerifiedAt: true },
				}),
				prisma.calendar.findMany({
					where: { userId: req.user.id, lastError: { not: null } },
					select: { id: true, name: true },
				}),
				prisma.friendship.findMany({
					where: {
						user2Id: req.user.id,
						status: "pending",
						user1: { disabled: false },
					},
					select: {
						id: true,
						user1: { select: { name: true, email: true } },
					},
				}),
			]);
			return {
				items: [
					...(!user.emailVerifiedAt
						? [
								{
									id: "verify",
									title: "Verify your email address",
									href: "/profile",
									tab: "profile",
								},
							]
						: []),
					...calendars.map((calendar) => ({
						id: `syncFailure:${calendar.id}`,
						title: `${calendar.name} needs synchronization attention`,
						href: "/dashboard",
						tab: "calendar",
					})),
					...requests.map((request) => ({
						id: `friendRequest:${request.id}`,
						title: `${request.user1.name || request.user1.email} sent a friend request`,
						href: "/friends",
						tab: "friends",
					})),
				],
			};
		},
	);

	app.patch<{ Params: { id: string }; Body: { read: boolean } }>(
		"/me/notifications/:id",
		{
			schema: contract(
				"readNotification",
				{ type: "null" },
				{ body: obj({ read: bool }) },
				204,
			),
		},
		async (req, reply) => {
			await prisma.notification.updateMany({
				where: { id: req.params.id, userId: req.user.id },
				data: { readAt: req.body.read ? new Date() : null },
			});
			return reply.code(204).send();
		},
	);

	app.get(
		"/me/notification-settings",
		{ schema: contract("notificationSettings", obj(preferences)) },
		async (req) => {
			return (
				(await prisma.userSettings.findUnique({
					where: { userId: req.user.id },
				})) ||
				Object.fromEntries(
					Object.keys(preferences).map((key) => [key, false]),
				)
			);
		},
	);
	app.patch<{
		Body: {
			emailFriendRequests?: boolean;
			emailFriendAccepted?: boolean;
			emailHighlights?: boolean;
			emailSyncFailures?: boolean;
		};
	}>(
		"/me/notification-settings",
		{
			schema: contract("updateNotificationSettings", obj(preferences), {
				body: obj(preferences, []),
			}),
		},
		async (req) =>
			prisma.userSettings.upsert({
				where: { userId: req.user.id },
				create: { userId: req.user.id, ...req.body },
				update: req.body,
			}),
	);
};

export default routes;
