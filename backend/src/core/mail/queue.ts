import { prisma, type Prisma } from "../database";
import { encrypt, tokenHash } from "../secrets";
import { fail } from "../http";
import { mailConfigured } from "./index";

export const activeMailStatuses = ["queued", "running", "retrying"];

export async function enqueueMail(
	tx: Prisma.TransactionClient,
	kind: string,
	payload: Record<string, string>,
	expiresAt: Date,
	userId?: string,
) {
	if (!mailConfigured())
		fail(
			503,
			"MAIL_UNAVAILABLE",
			"Email delivery is not configured. Contact an administrator.",
		);

	await tx.$executeRaw`SELECT pg_advisory_xact_lock(742905)`;

	if (
		(await tx.recoveryMail.count({
			where: { status: { in: activeMailStatuses } },
		})) >= 1000
	)
		fail(
			503,
			"MAIL_UNAVAILABLE",
			"Email service is busy. Try again later.",
		);

	return tx.recoveryMail.create({
		data: {
			kind,
			payload: encrypt(payload),
			recipientHash: tokenHash(payload.email),
			expiresAt,
			userId,
		},
	});
}

export async function finishMail(id: string, status: string) {
	await prisma.recoveryMail.updateMany({
		where: { id, status: { in: activeMailStatuses } },
		data: {
			status,
			finishedAt: new Date(),
			payload: "",
			leaseUntil: null,
			lastError: null,
		},
	});
}
