import {
	createHmac,
	randomBytes,
	randomInt,
	timingSafeEqual,
} from "node:crypto";
import { prisma, type Prisma } from "../../core/database";
import {
	encrypt,
	decrypt,
	opaqueToken,
	tokenHash,
	encryptionKey,
} from "../../core/secrets";
import { enqueueMail } from "../../core/mail/queue";
import { mailConfigured } from "../../core/mail";
import { fail } from "../../core/http";
import { generateToken } from "./auth";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function encodeSecret(bytes: Buffer) {
	let bits = 0,
		value = 0,
		output = "";

	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;

		while (bits >= 5) {
			bits -= 5;
			output += alphabet[(value >>> bits) & 31];
		}
	}

	if (bits) output += alphabet[(value << (5 - bits)) & 31];
	return output;
}

export function totp(secret: string, step: number): string {
	let bits = 0,
		value = 0;

	const bytes: number[] = [];

	for (const char of secret) {
		const digit = alphabet.indexOf(char);
		if (digit < 0) throw new Error("Invalid authenticator secret");
		value = (value << 5) | digit;
		bits += 5;

		if (bits >= 8) {
			bits -= 8;
			bytes.push((value >>> bits) & 255);
		}
	}

	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(step));

	const digest = createHmac("sha1", Buffer.from(bytes))
		.update(counter)
		.digest();

	const offset = digest[19] & 15;

	return String(
		(digest.readUInt32BE(offset) & 0x7fffffff) % 1000000,
	).padStart(6, "0");
}

const equal = (a: string, b: string) =>
	a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const verifier = (id: string, code: string) =>
	createHmac("sha256", encryptionKey()).update(`${id}:${code}`).digest("hex");

export async function securityState(userId: string) {
	const settings = await prisma.appSettings.findUnique({
		where: { id: "global" },
	});

	if (settings?.requireTwoFactor) {
		await prisma.user.updateMany({
			where: {
				id: userId,
				emailVerifiedAt: { not: null },
				twoFactorMethod: "none",
				securitySetupRequired: false,
			},
			data: { twoFactorMethod: "email" },
		});
	}

	const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

	const setupRequired =
		user.securitySetupRequired ||
		!!(settings?.requireTwoFactor && !user.emailVerifiedAt);

	return {
		user,
		required: settings?.requireTwoFactor ?? false,
		setupRequired,
	};
}

export async function beginChallenge(
	userId: string,
	purpose: "login" | "enroll",
	method?: string,
	expectedVersion?: number,
) {
	const raw = opaqueToken();
	const id = tokenHash(raw);
	const code = String(randomInt(1000000)).padStart(6, "0");
	const secret = encodeSecret(randomBytes(20));

	return prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
		const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

		if (
			expectedVersion !== undefined &&
			user.authVersion !== expectedVersion
		)
			fail(401, "UNAUTHENTICATED", "Sign in again");

		const selected = method || user.twoFactorMethod;

		if (
			user.disabled ||
			![
				"email",
				"totp",
				...(purpose === "login" &&
				user.twoFactorMethod !== "none" &&
				user.recoveryCodes.length
					? ["recovery"]
					: []),
			].includes(selected)
		)
			fail(
				403,
				"FACTOR_UNAVAILABLE",
				"This authentication method is unavailable",
			);

		if (selected === "email" && !user.emailVerifiedAt)
			fail(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email first");

		const recent = await tx.authChallenge.count({
			where: {
				userId,
				createdAt: { gt: new Date(Date.now() - 3600000) },
			},
		});

		const last = await tx.authChallenge.findFirst({
			where: { userId, purpose },
			orderBy: { createdAt: "desc" },
		});

		if (recent >= 10 || (last && Date.now() - +last.createdAt < 60000))
			fail(
				429,
				"CHALLENGE_RATE_LIMIT",
				"Wait before requesting another code",
			);

		await tx.authChallenge.updateMany({
			where: { userId, purpose, expiresAt: { gt: new Date() } },
			data: { expiresAt: new Date() },
		});

		const expiresAt = new Date(Date.now() + 300000);

		await tx.authChallenge.create({
			data: {
				id,
				userId,
				purpose,
				method: selected,
				authVersion: user.authVersion,
				expiresAt,
				verifier: selected === "email" ? verifier(id, code) : null,
				secret:
					purpose === "enroll" && selected === "totp"
						? encrypt({ secret })
						: null,
			},
		});

		if (selected === "email")
			await enqueueMail(
				tx,
				"code",
				{
					email: user.email,
					token: code,
					challengeId: id,
					authVersion: String(user.authVersion),
				},
				expiresAt,
				userId,
			);

		return {
			challenge: raw,
			method: selected,
			expiresAt: expiresAt.toISOString(),
			...(purpose === "enroll" && selected === "totp"
				? {
						secret,
						uri: `otpauth://totp/SocialAnimal:${encodeURIComponent(user.email)}?secret=${secret}&issuer=SocialAnimal&algorithm=SHA1&digits=6&period=30`,
					}
				: {}),
		};
	});
}

export async function completeChallenge(
	raw: string,
	code: string,
	purpose: "login" | "enroll",
	actorId?: string,
) {
	const id = tokenHash(raw);

	const outcome = await prisma.$transaction(async (tx) => {
		const initial = await tx.authChallenge.findUnique({ where: { id } });
		if (!initial || (actorId && initial.userId !== actorId)) return null;
		await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${initial.userId} FOR UPDATE`;
		const challenge = await tx.authChallenge.findUnique({ where: { id } });

		const user = await tx.user.findUnique({
			where: { id: initial.userId },
		});

		if (
			!challenge ||
			!user ||
			user.disabled ||
			challenge.purpose !== purpose ||
			challenge.expiresAt <= new Date() ||
			challenge.attempts >= 5 ||
			challenge.authVersion !== user.authVersion
		)
			return null;

		await tx.authChallenge.update({
			where: { id },
			data: { attempts: { increment: 1 } },
		});

		let step: number | undefined;
		let backup = false;

		let valid =
			challenge.method === "email" &&
			equal(verifier(id, code), challenge.verifier || "");

		if (challenge.method === "totp") {
			const envelope =
				purpose === "enroll" ? challenge.secret : user.totpSecret;

			if (envelope) {
				const secret = decrypt(envelope).secret;
				const current = Math.floor(Date.now() / 30000);

				step = [current, current - 1, current + 1].find(
					(candidate) =>
						(purpose === "enroll" ||
							BigInt(candidate) > (user.totpLastStep ?? -1n)) &&
						equal(totp(secret, candidate), code),
				);

				valid = step !== undefined;
			}
		}

		if (!valid && purpose === "login") {
			backup = user.recoveryCodes.includes(tokenHash(code));
			valid = backup;
		}

		if (!valid) return null;
		await tx.authChallenge.delete({ where: { id } });

		const codes =
			purpose === "enroll"
				? Array.from({ length: 10 }, () =>
						randomBytes(12).toString("hex"),
					)
				: undefined;

		const updated = await tx.user.update({
			where: { id: user.id },
			data:
				purpose === "enroll"
					? {
							twoFactorMethod: challenge.method,
							totpSecret: challenge.secret,
							totpLastStep:
								step === undefined ? null : BigInt(step),
							recoveryCodes: codes!.map(tokenHash),
							authVersion: { increment: 1 },
							securitySetupRequired: false,
						}
					: {
							...(step === undefined
								? {}
								: { totpLastStep: BigInt(step) }),
							...(backup
								? {
										recoveryCodes:
											user.recoveryCodes.filter(
												(hash) =>
													hash !== tokenHash(code),
											),
									}
								: {}),
						},
		});

		if (purpose === "enroll") await notifySecurity(tx, user.id, user.email);
		return { user: updated, codes };
	});

	if (!outcome)
		fail(
			400,
			"INVALID_CHALLENGE",
			"Invalid or expired code. Try again or sign in to request another code.",
		);

	const state = await securityState(outcome!.user.id);

	if (
		state.user.authVersion !== outcome!.user.authVersion ||
		state.user.disabled
	)
		fail(401, "UNAUTHENTICATED", "Credentials changed. Sign in again.");

	return {
		token: generateToken(state.user.id, state.user.authVersion, {
			mfa: true,
			setup: state.setupRequired,
		}),
		user: state.user,
		recoveryCodes: outcome!.codes,
		state: state.setupRequired ? "setup" : "authenticated",
	};
}

export async function notifySecurity(
	tx: Prisma.TransactionClient,
	userId: string,
	email: string,
) {
	if (mailConfigured())
		await enqueueMail(
			tx,
			"security",
			{ email },
			new Date(Date.now() + 86400000),
			userId,
		);
}

export async function resetFactor(
	userId: string,
	administratorId?: string,
	expectedVersion?: number,
) {
	return prisma.$transaction(async (tx) => {
		if (administratorId)
			await tx.$executeRaw`SELECT pg_advisory_xact_lock(742901)`;

		await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
		const target = await tx.user.findUnique({ where: { id: userId } });
		if (!target) return fail(404, "NOT_FOUND", "Account not found");

		if (
			expectedVersion !== undefined &&
			(target.disabled || target.authVersion !== expectedVersion)
		)
			fail(
				401,
				"INVALID_AUTHENTICATION",
				"Sign in again to change two-factor authentication",
			);

		const settings = await tx.appSettings.findUnique({
			where: { id: "global" },
		});

		if (administratorId) {
			const actor = await tx.user.findUnique({
				where: { id: administratorId },
			});

			if (!actor?.isAdmin || actor.disabled)
				fail(403, "FORBIDDEN", "Administrator access required");
		}

		if (!administratorId && settings?.requireTwoFactor)
			fail(
				403,
				"TWO_FACTOR_REQUIRED",
				"Two-factor authentication is required",
			);

		const user = await tx.user.update({
			where: { id: userId },
			data: {
				twoFactorMethod: "none",
				totpSecret: null,
				totpLastStep: null,
				recoveryCodes: [],
				authVersion: { increment: 1 },
				...(administratorId
					? { emailVerifiedAt: null, securitySetupRequired: true }
					: {}),
			},
		});

		await tx.authChallenge.deleteMany({ where: { userId } });
		await tx.emailVerification.deleteMany({ where: { userId } });
		await notifySecurity(tx, userId, user.email);
	});
}
