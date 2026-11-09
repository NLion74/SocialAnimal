import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import { prisma, type Prisma } from "../../core/database";
import { authenticateToken, requireAdmin } from "../identity";
import {
	contract,
	obj,
	str,
	fail,
	date,
	nullableString,
	list,
	page,
	pageArgs,
	pageQuery,
	type PageQuery,
} from "../../core/http";

export async function redeemInvite(
	tx: Prisma.TransactionClient,
	code: string | undefined,
	userId: string,
) {
	if (!code) fail(403, "INVITE_REQUIRED", "Invitation required");

	const result = await tx.inviteCode.updateMany({
		where: {
			code,
			usedBy: null,
			revokedAt: null,
			OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
		},
		data: { usedBy: userId, usedAt: new Date() },
	});

	if (result.count !== 1)
		fail(
			403,
			"INVITE_INVALID",
			"Invitation is invalid, expired, revoked, or already used. Ask an administrator for a new invitation.",
		);
}

const invitation = obj({
	id: str,
	label: nullableString,
	code: nullableString,
	registrationUrl: nullableString,
	createdAt: date,
	expiresAt: nullableString,
	revokedAt: nullableString,
	usedAt: nullableString,
	status: { type: "string", enum: ["active", "used", "expired", "revoked"] },
});

function present(row: Prisma.InviteCodeGetPayload<Record<string, never>>) {
	const status = row.revokedAt
		? "revoked"
		: row.usedBy
			? "used"
			: row.expiresAt && row.expiresAt <= new Date()
				? "expired"
				: "active";

	const origin = process.env.PUBLIC_URL || "http://localhost:3000";

	return {
		...row,
		status,
		code: status === "active" ? row.code : null,
		registrationUrl:
			status === "active"
				? `${origin}/register#invite=${encodeURIComponent(row.code)}`
				: null,
	};
}

const routes: FastifyPluginAsync = async (app) => {
	app.addHook("preHandler", authenticateToken);

	app.addHook("preHandler", async (req) => {
		await requireAdmin(req.user.id);
	});

	app.get<{ Querystring: PageQuery }>(
		"/invitations",
		{
			schema: contract("invitations", list(invitation), {
				querystring: obj(pageQuery, []),
			}),
		},
		async (req) =>
			page(
				(await prisma.inviteCode.findMany(pageArgs(req.query))).map(
					present,
				),
				req.query,
			),
	);

	app.post<{ Body?: { label?: string; expiresAt?: string | null } }>(
		"/invitations",
		{
			schema: contract(
				"createInvitation",
				invitation,
				{
					body: obj(
						{
							label: { ...str, maxLength: 100 },
							expiresAt: {
								type: ["string", "null"],
								format: "date-time",
							},
						},
						[],
					),
				},
				201,
			),
		},
		async (req, reply) => {
			const expiresAt =
				req.body?.expiresAt === null
					? null
					: req.body?.expiresAt
						? new Date(req.body.expiresAt)
						: new Date(Date.now() + 7 * 86400000);

			if (expiresAt && expiresAt <= new Date())
				fail(400, "INVALID_EXPIRY", "Choose a future expiry date");

			const row = await prisma.inviteCode.create({
				data: {
					createdBy: req.user.id,
					code: randomBytes(16).toString("hex"),
					label: req.body?.label?.trim() || null,
					expiresAt,
				},
			});

			return reply.code(201).send(present(row));
		},
	);

	app.delete<{ Params: { id: string } }>(
		"/invitations/:id",
		{
			schema: contract("revokeInvitation", { type: "null" }, {}, 204),
		},
		async (req, reply) => {
			const result = await prisma.inviteCode.updateMany({
				where: { id: req.params.id },
				data: { revokedAt: new Date() },
			});

			if (!result.count) fail(404, "NOT_FOUND", "Invitation not found");
			return reply.code(204).send();
		},
	);
};

export default routes;
