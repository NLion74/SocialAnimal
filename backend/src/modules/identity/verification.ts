import { prisma } from "../../core/database";
import { fail } from "../../core/http";
import { opaqueToken, tokenHash } from "../../core/secrets";
import { mailConfigured } from "../../core/mail";
import { enqueueMail } from "../../core/mail/queue";

export async function requestVerification(userId: string) {
	if (!mailConfigured())
		fail(
			503,
			"SMTP_NOT_CONFIGURED",
			"Verification email is unavailable. Contact an administrator.",
		);

	const token = opaqueToken();
	const now = new Date();

	await prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"email-verification:" + userId}))`;

		const user = await tx.user.findUniqueOrThrow({
			where: { id: userId },
			select: {
				email: true,
				emailVerifiedAt: true,
				disabled: true,
				accountRole: true,
			},
		});

		if (user.disabled)
			fail(403, "FORBIDDEN", "This account cannot request verification");

		if (user.emailVerifiedAt) return null;

		const existing = await tx.emailVerification.findUnique({
			where: { userId },
		});

		if (existing && +now - +existing.lastSentAt < 60000)
			fail(
				429,
				"VERIFICATION_RATE_LIMIT",
				"Wait one minute before requesting another email",
			);

		const newWindow =
			!existing || +now - +existing.windowStartedAt >= 86400000;

		if (!newWindow && existing.requestCount >= 10)
			fail(
				429,
				"VERIFICATION_RATE_LIMIT",
				"Daily verification email limit reached. Try again tomorrow.",
			);

		const data = {
			email: user.email,
			tokenHash: tokenHash(token),
			expiresAt: new Date(+now + 86400000),
			consumedAt: null,
			lastSentAt: now,
			windowStartedAt: newWindow ? now : existing.windowStartedAt,
			requestCount: newWindow ? 1 : existing.requestCount + 1,
		};

		await tx.emailVerification.upsert({
			where: { userId },
			create: { ...data, userId },
			update: data,
		});

		await enqueueMail(
			tx,
			"verify",
			{ email: user.email, token },
			data.expiresAt,
			userId,
		);
	});
}

export async function confirmVerification(token: string) {
	if (!/^[A-Za-z0-9_-]{43}$/.test(token))
		fail(
			400,
			"INVALID_VERIFICATION",
			"This verification link is invalid or expired",
		);

	await prisma.$transaction(async (tx) => {
		const row = await tx.emailVerification.findUnique({
			where: { tokenHash: tokenHash(token) },
		});

		if (!row)
			return fail(
				400,
				"INVALID_VERIFICATION",
				"This verification link is invalid or expired",
			);

		const consumed = await tx.emailVerification.updateMany({
			where: {
				id: row.id,
				tokenHash: row.tokenHash,
				consumedAt: null,
				expiresAt: { gt: new Date() },
			},
			data: { consumedAt: new Date() },
		});

		if (!consumed.count)
			fail(
				400,
				"INVALID_VERIFICATION",
				"This verification link is invalid or expired",
			);

		const verified = await tx.user.updateMany({
			where: {
				id: row.userId,
				email: row.email,
				disabled: false,
			},
			data: { emailVerifiedAt: new Date() },
		});

		const settings = await tx.appSettings.findUnique({
			where: { id: "global" },
		});

		await tx.user.updateMany({
			where: {
				id: row.userId,
				emailVerifiedAt: { not: null },
				twoFactorMethod: "none",
				...(settings?.requireTwoFactor
					? {}
					: { securitySetupRequired: true }),
			},
			data: { twoFactorMethod: "email", securitySetupRequired: false },
		});

		await tx.user.updateMany({
			where: { id: row.userId, emailVerifiedAt: { not: null } },
			data: { securitySetupRequired: false },
		});

		if (!verified.count)
			fail(
				400,
				"INVALID_VERIFICATION",
				"This verification link is invalid or expired",
			);
	});
}
