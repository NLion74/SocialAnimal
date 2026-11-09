import type { FastifyPluginAsync } from "fastify";
import { mailConfigured } from "../../core/mail";
import { prisma, type Prisma } from "../../core/database";
import {
	authenticateToken,
	requireAdmin,
	requireRecentAuthentication,
} from "../identity";
import { contract, obj, bool, str, fail } from "../../core/http";

export const registrationSettings = (tx: Prisma.TransactionClient = prisma) =>
	tx.appSettings.upsert({
		where: { id: "global" },
		create: { id: "global" },
		update: {},
	});

const instance = obj({
	registrationsOpen: bool,
	inviteOnly: bool,
	requireEmailVerification: bool,
	requireTwoFactor: bool,
	maxCalendarsPerUser: { type: "integer", minimum: 1, maximum: 1000 },
	minSyncIntervalMinutes: { type: "integer", minimum: 1, maximum: 10080 },
	syncPastDays: { type: "integer", minimum: 0, maximum: 3650 },
	syncFutureDays: { type: "integer", minimum: 0, maximum: 3650 },
	defaultTimezone: { ...str, minLength: 1, maxLength: 100 },
	defaultFirstDayOfWeek: { type: "string", enum: ["monday", "sunday"] },
});

export async function effectiveMinimumInterval(
	tx: Prisma.TransactionClient = prisma,
) {
	const settings = await registrationSettings(tx);

	return Math.max(
		1,
		Number(process.env.MIN_SYNC_INTERVAL_MINUTES) || 15,
		settings.minSyncIntervalMinutes,
	);
}

export async function checkSyncInterval(
	interval: number | undefined,
	tx: Prisma.TransactionClient = prisma,
) {
	if (
		interval !== undefined &&
		interval !== 0 &&
		interval < (await effectiveMinimumInterval(tx))
	)
		fail(
			400,
			"SYNC_INTERVAL_TOO_SHORT",
			`Sync interval must be 0 (manual) or at least ${await effectiveMinimumInterval(tx)} minutes`,
		);
}

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
		async () => ({
			...(await registrationSettings()),
			minSyncIntervalMinutes: await effectiveMinimumInterval(),
		}),
	);

	app.get(
		"/admin/settings",
		{
			preHandler: authenticateToken,
			schema: contract(
				"adminSettings",
				obj({ ...instance.properties, smtpConfigured: bool }),
			),
		},
		async (req) => {
			await requireAdmin(req.user.id);

			return {
				...(await registrationSettings()),
				smtpConfigured: mailConfigured(),
			};
		},
	);

	app.patch<{
		Body: {
			registrationsOpen?: boolean;
			inviteOnly?: boolean;
			requireEmailVerification?: boolean;
			requireTwoFactor?: boolean;
			maxCalendarsPerUser?: number;
			minSyncIntervalMinutes?: number;
			syncPastDays?: number;
			syncFutureDays?: number;
			defaultTimezone?: string;
			defaultFirstDayOfWeek?: string;
		};
	}>(
		"/admin/settings",
		{
			preHandler: authenticateToken,
			schema: contract("updateAdminSettings", instance, {
				body: obj(instance.properties, []),
			}),
		},
		async (req) => {
			await requireAdmin(req.user.id);

			if (
				(req.body.requireEmailVerification ||
					req.body.requireTwoFactor) &&
				!mailConfigured()
			)
				fail(
					409,
					"SMTP_NOT_CONFIGURED",
					"Configure SMTP before requiring email verification",
				);

			if (req.body.defaultTimezone)
				validateTimezone(req.body.defaultTimezone);

			return prisma.$transaction(async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(742903)`;
				const current = await registrationSettings(tx);

				if (
					req.body.requireTwoFactor !== undefined &&
					req.body.requireTwoFactor !== current.requireTwoFactor
				)
					requireRecentAuthentication(req);

				if (
					(req.body.syncPastDays ?? current.syncPastDays) +
						(req.body.syncFutureDays ?? current.syncFutureDays) ===
					0
				)
					fail(
						400,
						"INVALID_SYNC_WINDOW",
						"The combined sync window must be at least one day",
					);

				return tx.appSettings.update({
					where: { id: "global" },
					data: req.body,
				});
			});
		},
	);

	app.get(
		"/me/settings",
		{
			preHandler: authenticateToken,
			schema: contract("mySettings", prefs),
		},
		async (req) =>
			prisma.userSettings.upsert({
				where: { userId: req.user.id },
				create: {
					userId: req.user.id,
					...(await defaultPreferences()),
				},
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
		async (req) => {
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
				create: {
					userId: req.user.id,
					...(await defaultPreferences()),
					...req.body,
				},
				update: req.body,
			});
		},
	);
};

export default routes;

export function validateTimezone(timezone: string) {
	try {
		new Intl.DateTimeFormat("en", { timeZone: timezone });
	} catch {
		fail(400, "INVALID_TIMEZONE", "Unknown timezone");
	}
}

export async function defaultPreferences(
	tx: Prisma.TransactionClient = prisma,
) {
	const settings = await registrationSettings(tx);

	return {
		timezone: settings.defaultTimezone,
		firstDayOfWeek: settings.defaultFirstDayOfWeek,
	};
}
