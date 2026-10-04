import { prisma } from "../../core/database";
import { tokenHash, decrypt } from "../../core/secrets";
import { fail } from "../../core/http";
import { protectLastAdmin } from "./roles";

export async function deleteAccount(userId: string, administratorId?: string) {
	await prisma.$transaction(async (tx) => {
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
	});
}
