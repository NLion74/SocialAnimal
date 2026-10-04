import { prisma, type Prisma } from "../../core/database";
import { decrypt, encrypt, opaqueToken, tokenHash } from "../../core/secrets";
import { fail } from "../../core/http";
import { mailConfigured, sendAccountEmail } from "../../core/mail";
import { hashPassword } from "./passwords";

import { finishMail, activeMailStatuses } from "../../core/mail/queue";

const ttl = 30 * 60 * 1000;

const hour = 60 * 60 * 1000;

export async function requestPasswordReset(email: string) {
	if (!mailConfigured())
		fail(
			503,
			"MAIL_UNAVAILABLE",
			"Password recovery email is not configured. Contact an administrator.",
		);

	// The public path does the same work for existing and unknown accounts.
	await prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(742905)`;
		const now = new Date();

		await tx.recoveryThrottle.deleteMany({
			where: { expiresAt: { lte: now } },
		});

		const key = tokenHash(email);
		const limit = await tx.recoveryThrottle.findUnique({ where: { key } });
		if (limit && limit.count >= 5) return;

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

		await tx.recoveryThrottle.upsert({
			where: { key },
			create: { key, expiresAt: new Date(Date.now() + hour) },
			update: { count: { increment: 1 } },
		});

		await tx.recoveryMail.create({
			data: {
				kind: "request",
				payload: encrypt({ email }),
				recipientHash: tokenHash(email),
				expiresAt: new Date(Date.now() + ttl),
			},
		});
	});
}

export async function passwordChanged(
	tx: Prisma.TransactionClient,
	userId: string,
	email: string,
) {
	await tx.passwordReset.deleteMany({ where: { userId } });
	await tx.oAuthFlow.deleteMany({ where: { userId } });

	if (mailConfigured())
		await tx.recoveryMail.create({
			data: {
				kind: "changed",
				payload: encrypt({ email }),
				recipientHash: tokenHash(email),
				userId,
				expiresAt: new Date(Date.now() + 24 * hour),
			},
		});
}

export async function resetPassword(token: string, password: string) {
	const invalid = () =>
		fail(
			400,
			"INVALID_RESET",
			"This reset link is invalid or expired. Request a new link.",
		);

	const found = await prisma.passwordReset.findUnique({
		where: { tokenHash: tokenHash(token) },
	});

	if (!found || found.expiresAt <= new Date()) return invalid();
	const { hash, salt } = await hashPassword(password);

	await prisma.$transaction(async (tx) => {
		// Serialize reset consumption and password changes on the user row.
		await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${found.userId} FOR UPDATE`;

		const row = await tx.passwordReset.findUnique({
			where: { id: found.id },
		});

		if (!row || row.expiresAt <= new Date()) return invalid();

		const updated = await tx.user.updateMany({
			where: {
				id: row.userId,
				email: row.email,
				authVersion: row.authVersion,
				disabled: false,
				accountRole: { not: "readonly" },
			},
			data: {
				passwordHash: hash,
				salt,
				authVersion: { increment: 1 },
				passwordChangedAt: new Date(),
			},
		});

		if (!updated.count) return invalid();
		await passwordChanged(tx, row.userId, row.email);
	});
}

export async function runRecoveryTick(logger?: JobLogger) {
	const now = new Date();

	await prisma.recoveryMail.updateMany({
		where: { status: { in: activeMailStatuses }, expiresAt: { lte: now } },
		data: {
			status: "expired",
			finishedAt: now,
			payload: "",
			leaseUntil: null,
		},
	});

	await prisma.recoveryMail.deleteMany({
		where: { finishedAt: { lt: new Date(+now - 30 * 86400000) } },
	});

	await prisma.authChallenge.deleteMany({
		where: {
			expiresAt: { lte: now },
			createdAt: { lt: new Date(+now - hour) },
		},
	});

	await prisma.passwordReset.deleteMany({
		where: { expiresAt: { lte: now } },
	});

	await prisma.recoveryThrottle.deleteMany({
		where: { expiresAt: { lte: now } },
	});

	for (let i = 0; i < 10; i++) {
		const job = await prisma.$transaction(async (tx) => {
			const rows = await tx.$queryRaw<
				Array<{ id: string }>
			>`SELECT "id" FROM "RecoveryMail" WHERE "status" IN ('queued', 'retrying', 'running') AND "expiresAt" > ${now} AND "availableAt" <= ${now} AND ("leaseUntil" IS NULL OR "leaseUntil" < ${now}) ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;

			if (!rows.length) return null;

			return tx.recoveryMail.update({
				where: { id: rows[0].id },
				data: {
					status: "running",
					leaseUntil: new Date(Date.now() + 120000),
					attempts: { increment: 1 },
				},
			});
		});

		if (!job) break;

		try {
			let payload = decrypt(job.payload);
			let kind = job.kind;

			if (kind === "request") {
				const prepared = await prisma.$transaction(async (tx) => {
					const user = await tx.user.findUnique({
						where: { email: payload.email },
					});

					if (!user) return null;
					await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;

					const current = await tx.user.findUniqueOrThrow({
						where: { id: user.id },
					});

					if (
						current.createdAt > job.createdAt ||
						current.disabled ||
						current.accountRole === "readonly" ||
						(current.passwordChangedAt &&
							current.passwordChangedAt >= job.createdAt)
					)
						return null;

					const token = opaqueToken();

					await tx.passwordReset.create({
						data: {
							userId: current.id,
							email: current.email,
							tokenHash: tokenHash(token),
							authVersion: current.authVersion,
							expiresAt: job.expiresAt,
						},
					});

					const next = { email: current.email, token };

					await tx.recoveryMail.update({
						where: { id: job.id },
						data: {
							kind: "reset",
							payload: encrypt(next),
							userId: current.id,
						},
					});

					return next;
				});

				if (!prepared) {
					await finishMail(job.id, "cancelled");
					continue;
				}

				payload = prepared;
				kind = "reset";
			}

			if (kind === "reset") {
				const reset = await prisma.passwordReset.findUnique({
					where: { tokenHash: tokenHash(payload.token) },
					include: { user: true },
				});

				if (
					!reset ||
					reset.expiresAt <= new Date() ||
					reset.user.disabled ||
					reset.user.accountRole === "readonly" ||
					reset.user.authVersion !== reset.authVersion
				) {
					await finishMail(job.id, "cancelled");
					continue;
				}
			}

			if (
				job.userId &&
				!(await prisma.user.findFirst({
					where: {
						id: job.userId,
						disabled: false,
						email: payload.email,
					},
				}))
			) {
				await finishMail(job.id, "cancelled");
				continue;
			}

			if (
				kind === "verify" &&
				!(await prisma.emailVerification.findFirst({
					where: {
						tokenHash: tokenHash(payload.token),
						consumedAt: null,
						expiresAt: { gt: new Date() },
					},
				}))
			) {
				await finishMail(job.id, "cancelled");
				continue;
			}

			if (
				kind === "code" &&
				!(await prisma.authChallenge.findFirst({
					where: {
						id: payload.challengeId,
						expiresAt: { gt: new Date() },
						attempts: { lt: 5 },
						user: {
							authVersion: Number(payload.authVersion),
							disabled: false,
						},
					},
				}))
			) {
				await finishMail(job.id, "cancelled");
				continue;
			}

			await sendAccountEmail(
				payload.email,
				kind as "reset" | "changed" | "verify" | "code" | "security",
				payload.token,
			);

			await finishMail(job.id, "sent");

			logger?.info(
				{
					job: "email-delivery",
					jobId: job.id,
					status: "sent",
					attempts: job.attempts,
				},
				"Email accepted by SMTP server",
			);
		} catch {
			logger?.warn(
				{
					job: "email-delivery",
					jobId: job.id,
					status: job.attempts >= 5 ? "failed" : "retrying",
					attempts: job.attempts,
				},
				"Email delivery failed",
			);
			// Never log recipient addresses, tokens, SMTP errors or encrypted payloads.
			await prisma.recoveryMail.updateMany({
				where: { id: job.id, status: "running" },
				data: {
					status: job.attempts >= 5 ? "failed" : "retrying",
					finishedAt: job.attempts >= 5 ? new Date() : null,
					payload: job.attempts >= 5 ? "" : undefined,
					lastError: "SMTP delivery failed",
					leaseUntil: null,
					availableAt: new Date(
						Date.now() +
							Math.min(300000, 15000 * 2 ** job.attempts),
					),
				},
			});
		}
	}
}

import type { JobLogger } from "../../core/jobs";
