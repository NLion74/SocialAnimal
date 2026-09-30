import type { FastifyPluginAsync } from "fastify";
import { randomBytes } from "node:crypto";
import { prisma, type Prisma } from "../../core/database";
import { authenticateToken, requireAdmin } from "../identity";
import { contract, obj, str, fail } from "../../core/http";

export async function redeemInvite(
	tx: Prisma.TransactionClient,
	code: string | undefined,
	userId: string,
) {
	if (!code) fail(403, "INVITE_REQUIRED", "Invitation required");

	const result = await tx.inviteCode.updateMany({
		where: { code, usedBy: null },
		data: { usedBy: userId, usedAt: new Date() },
	});

	if (result.count !== 1)
		fail(403, "INVITE_INVALID", "Invitation is invalid or used");
}

const routes: FastifyPluginAsync = async (app) => {
	app.post(
		"/invitations",
		{
			preHandler: authenticateToken,
			schema: contract(
				"createInvitation",
				obj({ id: str, code: str }),
				{},
				201,
			),
		},
		async (req, reply) => {
			await requireAdmin(req.user.id);

			return reply.code(201).send(
				await prisma.inviteCode.create({
					data: {
						createdBy: req.user.id,
						code: randomBytes(16).toString("hex"),
					},
				}),
			);
		},
	);
};

export default routes;
