import type { FastifyPluginAsync } from "fastify";
import { prisma, type Prisma } from "../../core/database";
import { authenticateToken, requireAdmin } from "../identity";
import { contract, obj, bool, str, fail } from "../../core/http";

export const registrationSettings = (tx: Prisma.TransactionClient = prisma) =>
	tx.appSettings.upsert({
		where: { id: "global" },
		create: { id: "global" },
		update: {},
	});

const instance = obj({ registrationsOpen: bool, inviteOnly: bool });

const prefs = obj({
	firstDayOfWeek: { type: "string", enum: ["monday", "sunday"] },
	timezone: str,
	defaultTab: {
		type: "string",
		enum: ["dashboard", "calendar", "friends", "profile"],
	},
});

const routes: FastifyPluginAsync = async (app) => {
	app.get(
		"/settings/public",
		{ schema: contract("publicSettings", instance) },
		() => registrationSettings(),
	);

	app.get(
		"/admin/settings",
		{
			preHandler: authenticateToken,
			schema: contract("adminSettings", instance),
		},
		async (req) => {
			await requireAdmin(req.user.id);
			return registrationSettings();
		},
	);

	app.patch<{ Body: { registrationsOpen?: boolean; inviteOnly?: boolean } }>(
		"/admin/settings",
		{
			preHandler: authenticateToken,
			schema: contract("updateAdminSettings", instance, {
				body: obj(instance.properties, []),
			}),
		},
		async (req) => {
			await requireAdmin(req.user.id);

			return prisma.appSettings.upsert({
				where: { id: "global" },
				create: { id: "global", ...req.body },
				update: req.body,
			});
		},
	);

	app.get(
		"/me/settings",
		{
			preHandler: authenticateToken,
			schema: contract("mySettings", prefs),
		},
		(req) =>
			prisma.userSettings.upsert({
				where: { userId: req.user.id },
				create: { userId: req.user.id },
				update: {},
			}),
	);

	app.patch<{
		Body: {
			firstDayOfWeek?: string;
			timezone?: string;
			defaultTab?: string;
		};
	}>(
		"/me/settings",
		{
			preHandler: authenticateToken,
			schema: contract("updateMySettings", prefs, {
				body: obj(prefs.properties, []),
			}),
		},
		(req) => {
			if (req.body.timezone) {
				try {
					new Intl.DateTimeFormat("en", {
						timeZone: req.body.timezone,
					});
				} catch {
					fail(400, "INVALID_TIMEZONE", "Unknown timezone");
				}
			}

			return prisma.userSettings.upsert({
				where: { userId: req.user.id },
				create: { userId: req.user.id, ...req.body },
				update: req.body,
			});
		},
	);
};

export default routes;
