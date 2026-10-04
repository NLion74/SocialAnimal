import { publicProviderMessage } from "../../core/http/provider-errors";
import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../core/database";
import {
	authenticateToken,
	deleteAccount,
	resetFactor,
	requireRecentAuthentication,
	requestPasswordReset,
	requireAdmin,
	requireStaff,
	protectLastAdmin,
	roles,
	type AccountRole,
} from "../identity";
import {
	contract,
	obj,
	str,
	bool,
	integer,
	date,
	nullableString,
	list,
	page,
	pageArgs,
	pageQuery,
	fail,
	type PageQuery,
} from "../../core/http";

const user = obj({
	id: str,
	email: str,
	name: nullableString,
	accountRole: { type: "string", enum: [...roles] },
	disabled: bool,
	emailVerifiedAt: nullableString,
	createdAt: date,
	calendarCount: integer,
});

const userSelect = {
	id: true,
	email: true,
	name: true,
	accountRole: true,
	disabled: true,
	emailVerifiedAt: true,
	createdAt: true,
	_count: { select: { calendars: true } },
} as const;

const logs = obj({
	id: str,
	calendarId: str,
	calendarName: str,
	ownerEmail: str,
	status: str,
	createdAt: date,
	startedAt: nullableString,
	finishedAt: nullableString,
	error: nullableString,
	eventsSynced: { type: ["integer", "null"] },
});

const routes: FastifyPluginAsync = async (app) => {
	app.addHook("preHandler", authenticateToken);
	app.addHook("preHandler", async (req) => requireStaff(req.user.id));

	app.delete<{ Params: { id: string } }>(
		"/admin/users/:id",
		{ schema: contract("deleteAdminUser", { type: "null" }, {}, 204) },
		async (req, reply) => {
			await requireAdmin(req.user.id);
			requireRecentAuthentication(req);
			await deleteAccount(req.params.id, req.user.id);
			return reply.code(204).send();
		},
	);

	app.post<{ Params: { id: string } }>(
		"/admin/users/:id/two-factor-resets",
		{ schema: contract("adminResetTwoFactor", obj({ ok: bool })) },
		async (req) => {
			await requireAdmin(req.user.id);
			requireRecentAuthentication(req);

			if (req.params.id === req.user.id)
				fail(
					403,
					"FORBIDDEN",
					"Use your profile security settings to change your own factor",
				);

			await resetFactor(req.params.id, req.user.id);
			return { ok: true };
		},
	);

	const emailStatuses = [
		"queued",
		"running",
		"retrying",
		"sent",
		"failed",
		"expired",
		"cancelled",
	];

	app.get<{ Querystring: PageQuery & { status?: string } }>(
		"/admin/email-jobs",
		{
			schema: contract(
				"adminEmailJobs",
				obj({
					...list(
						obj({
							id: str,
							kind: str,
							status: str,
							attempts: integer,
							createdAt: date,
							finishedAt: nullableString,
							lastError: nullableString,
						}),
					).properties,
					counts: { type: "object", additionalProperties: integer },
				}),
				{
					querystring: obj(
						{
							...pageQuery,
							status: { type: "string", enum: emailStatuses },
						},
						[],
					),
				},
			),
		},
		async (req) => {
			const [rows, groups] = await Promise.all([
				prisma.recoveryMail.findMany({
					where: { status: req.query.status },
					...pageArgs(req.query),
					orderBy: [{ createdAt: "desc" }, { id: "desc" }],
					select: {
						id: true,
						kind: true,
						status: true,
						attempts: true,
						createdAt: true,
						finishedAt: true,
						lastError: true,
					},
				}),
				prisma.recoveryMail.groupBy({ by: ["status"], _count: true }),
			]);

			return {
				...page(rows, req.query),
				counts: Object.fromEntries(
					emailStatuses.map((status) => [
						status,
						groups.find((row) => row.status === status)?._count ||
							0,
					]),
				),
			};
		},
	);

	app.delete(
		"/admin/email-jobs",
		{ schema: contract("clearEmailJobs", obj({ deletedLogs: integer })) },
		async (req) => {
			await requireAdmin(req.user.id);

			const deleted = await prisma.recoveryMail.deleteMany({
				where: {
					status: { in: ["sent", "failed", "expired", "cancelled"] },
					finishedAt: { lte: new Date() },
				},
			});

			return { deletedLogs: deleted.count };
		},
	);

	app.post<{ Params: { id: string } }>(
		"/admin/users/:id/password-reset-requests",
		{
			schema: contract(
				"adminRequestPasswordReset",
				obj({ accepted: bool }),
				{},
				202,
			),
		},
		async (req, reply) => {
			await requireAdmin(req.user.id);

			const target = await prisma.user.findUnique({
				where: { id: req.params.id },
			});

			if (!target) return fail(404, "NOT_FOUND", "User not found");

			if (target.disabled || target.accountRole === "readonly")
				return fail(
					403,
					"RECOVERY_DISABLED",
					"Password recovery is unavailable for disabled or demo accounts.",
				);

			await requestPasswordReset(target.email);
			return reply.code(202).send({ accepted: true });
		},
	);

	app.get(
		"/admin/stats",
		{
			schema: contract(
				"adminStats",
				obj({
					users: integer,
					calendars: integer,
					events: integer,
					connections: integer,
					activeSyncs: integer,
					failedSyncsToday: integer,
				}),
			),
		},
		async () => {
			const [
				users,
				calendars,
				events,
				connections,
				activeSyncs,
				failedSyncsToday,
			] = await prisma.$transaction([
				prisma.user.count(),
				prisma.calendar.count(),
				prisma.event.count(),
				prisma.connection.count(),
				prisma.syncRun.count({
					where: { status: { in: ["queued", "running"] } },
				}),
				prisma.syncRun.count({
					where: {
						status: "failed",
						finishedAt: { gte: new Date(Date.now() - 86400000) },
					},
				}),
			]);

			return {
				users,
				calendars,
				events,
				connections,
				activeSyncs,
				failedSyncsToday,
			};
		},
	);

	app.get<{ Querystring: PageQuery & { query?: string } }>(
		"/admin/users",
		{
			schema: contract("adminUsers", list(user), {
				querystring: obj(
					{ ...pageQuery, query: { type: "string", maxLength: 100 } },
					[],
				),
			}),
		},
		async (req) => {
			const rows = await prisma.user.findMany({
				where: req.query.query
					? {
							OR: [
								{
									email: {
										contains: req.query.query,
										mode: "insensitive",
									},
								},
								{
									name: {
										contains: req.query.query,
										mode: "insensitive",
									},
								},
							],
						}
					: {},
				select: userSelect,
				...pageArgs(req.query),
			});

			return page(
				rows.map(({ _count, ...row }) => ({
					...row,
					calendarCount: _count.calendars,
				})),
				req.query,
			);
		},
	);

	app.patch<{
		Params: { id: string };
		Body: {
			accountRole?: AccountRole;
			disabled?: boolean;
			emailVerified?: boolean;
		};
	}>(
		"/admin/users/:id",
		{
			schema: contract("updateAdminUser", user, {
				body: obj(
					{
						accountRole: { type: "string", enum: [...roles] },
						disabled: bool,
						emailVerified: bool,
					},
					[],
				),
			}),
		},
		async (req) => {
			await requireAdmin(req.user.id);

			const row = await prisma.$transaction(async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(742901)`;
				// Re-check after acquiring the same lock used by demotion and deletion.
				const actor = await tx.user.findUnique({
					where: { id: req.user.id },
					select: { isAdmin: true, disabled: true },
				});

				if (!actor?.isAdmin || actor.disabled)
					fail(403, "FORBIDDEN", "Administrator access required");

				if (
					!(await tx.user.findUnique({
						where: { id: req.params.id },
						select: { id: true },
					}))
				)
					fail(404, "NOT_FOUND", "User not found");

				if (
					req.body.disabled ||
					(req.body.accountRole && req.body.accountRole !== "admin")
				)
					await protectLastAdmin(tx, req.params.id);

				return tx.user.update({
					where: { id: req.params.id },
					data: {
						accountRole: req.body.accountRole,
						isAdmin:
							req.body.accountRole === undefined
								? undefined
								: req.body.accountRole === "admin",
						disabled: req.body.disabled,
						authVersion:
							req.body.disabled === true
								? { increment: 1 }
								: undefined,
						emailVerifiedAt:
							req.body.emailVerified === undefined
								? undefined
								: req.body.emailVerified
									? new Date()
									: null,
					},
					select: userSelect,
				});
			});

			return { ...row, calendarCount: row._count.calendars };
		},
	);

	app.delete(
		"/admin/sync-runs",
		{
			schema: contract(
				"clearSyncLogs",
				obj({ deletedLogs: integer, clearedErrors: integer }),
			),
		},
		async (req) => {
			await requireAdmin(req.user.id);
			const cutoff = new Date();

			return prisma.$transaction(async (tx) => {
				await tx.$executeRaw`SELECT pg_advisory_xact_lock(742904)`;
				// Lock only calendars with existing errors; concurrent completions are preserved.
				const rows = await tx.$queryRaw<
					Array<{ id: string }>
				>`SELECT "id" FROM "Calendar" WHERE "lastError" IS NOT NULL AND ("lastAttempt" IS NULL OR "lastAttempt" <= ${cutoff}) AND NOT EXISTS (SELECT 1 FROM "SyncRun" WHERE "SyncRun"."calendarId" = "Calendar"."id" AND "status" = 'failed' AND "finishedAt" > ${cutoff}) ORDER BY "id" FOR UPDATE`;

				const cleared = await tx.calendar.updateMany({
					where: { id: { in: rows.map((row) => row.id) } },
					data: { lastError: null },
				});

				const deleted = await tx.syncRun.deleteMany({
					where: {
						status: { in: ["succeeded", "failed"] },
						finishedAt: { lte: cutoff },
					},
				});

				return {
					deletedLogs: deleted.count,
					clearedErrors: cleared.count,
				};
			});
		},
	);

	app.get<{ Querystring: PageQuery & { status?: string } }>(
		"/admin/sync-runs",
		{
			schema: contract("adminSyncRuns", list(logs), {
				querystring: obj(
					{
						...pageQuery,
						status: {
							type: "string",
							enum: ["queued", "running", "succeeded", "failed"],
						},
					},
					[],
				),
			}),
		},
		async (req) => {
			const rows = await prisma.syncRun.findMany({
				where: { status: req.query.status },
				include: {
					calendar: {
						select: {
							name: true,
							user: { select: { email: true } },
						},
					},
				},
				...pageArgs(req.query),
				orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			});

			return page(
				rows.map(({ calendar, ...row }) => ({
					...row,
					calendarName: calendar.name,
					ownerEmail: calendar.user.email,
					error: publicProviderMessage(row.error),
				})),
				req.query,
			);
		},
	);
};

export default routes;
