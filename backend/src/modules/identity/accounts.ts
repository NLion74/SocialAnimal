import { prisma } from "../../core/database";
import { tokenHash, decrypt } from "../../core/secrets";
import { fail } from "../../core/http";
import { protectLastAdmin } from "./roles";
import { beginChallenge, consumeChallenge } from "./two-factor";
import { verifyPassword } from "./passwords";

export type DeletionProof = { challenge: string; code: string };

export async function beginAccountDeletion(
	userId: string,
	recovery = false,
	expectedVersion?: number,
	administratorId?: string,
) {
	const actorId = administratorId || userId;

	const actor = await prisma.user.findUniqueOrThrow({
		where: { id: actorId },
	});

	if (actor.disabled || (administratorId && !actor.isAdmin))
		fail(403, "FORBIDDEN", "Administrator access required");

	if (
		!(await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true },
		}))
	)
		fail(404, "NOT_FOUND", "Account not found");

	if (actor.twoFactorMethod === "none") return { required: false };

	return {
		required: true,
		...(await beginChallenge(
			actorId,
			`delete:${userId}`,
			recovery ? "recovery" : undefined,
			expectedVersion ?? actor.authVersion,
		)),
	};
}

export async function deleteAccount(
	userId: string,
	administratorId?: string,
	proof?: DeletionProof,
	password?: string,
) {
	const deleted = await prisma.$transaction(async (tx) => {
		await protectLastAdmin(tx, userId);

		if (administratorId) {
			const actor = await tx.user.findUnique({
				where: { id: administratorId },
			});

			if (!actor?.isAdmin || actor.disabled)
				fail(403, "FORBIDDEN", "Administrator access required");
		}

		await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
		const user = await tx.user.findUnique({ where: { id: userId } });
		if (!user) fail(404, "NOT_FOUND", "Account not found");

		const actorId = administratorId || userId;
		await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR UPDATE`;

		const actor = await tx.user.findUniqueOrThrow({
			where: { id: actorId },
		});

		if (actor.disabled || (administratorId && !actor.isAdmin))
			fail(403, "FORBIDDEN", "Account deletion is not permitted");

		if (
			!administratorId &&
			password !== undefined &&
			!(await verifyPassword(password, user!.passwordHash, user!.salt))
		)
			fail(403, "INVALID_CREDENTIALS", "Password incorrect");

		if (actor.twoFactorMethod !== "none") {
			if (!proof)
				fail(
					403,
					"TWO_FACTOR_REQUIRED",
					"Confirm account deletion with a two-factor code",
				);

			if (
				!(await consumeChallenge(
					tx,
					proof!.challenge,
					proof!.code,
					`delete:${userId}`,
					actorId,
				))
			)
				return false;
		}

		await tx.recoveryMail.deleteMany({
			where: {
				OR: [{ userId }, { recipientHash: tokenHash(user!.email) }],
			},
		});
		// Older queued jobs predate recipient hashes. Only inspect bounded active jobs.
		const legacyJobs = await tx.recoveryMail.findMany({
			where: {
				recipientHash: null,
				status: { in: ["queued", "running", "retrying"] },
			},
			take: 1000,
		});

		for (const job of legacyJobs) {
			if (decrypt(job.payload).email === user!.email)
				await tx.recoveryMail.delete({ where: { id: job.id } });
		}

		await tx.inviteCode.updateMany({
			where: { createdBy: userId, usedAt: null },
			data: { revokedAt: new Date() },
		});

		await tx.subscription.deleteMany({ where: { issuerId: userId } });

		await tx.calendarShare.deleteMany({
			where: { OR: [{ sharedWithId: userId }, { ruleset: { userId } }] },
		});

		await tx.calendar.deleteMany({ where: { userId } });
		await tx.user.delete({ where: { id: userId } });
		return true;
	});

	if (!deleted)
		fail(
			400,
			"INVALID_CHALLENGE",
			"Invalid or expired confirmation code. Request another code and try again.",
		);
}
