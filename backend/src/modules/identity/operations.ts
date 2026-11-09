import { prisma } from "../../core/database";
import { fail } from "../../core/http";
import { hashPassword, verifyPassword, generateToken } from "./auth";
import { redeemInvite } from "../invitations";
import { seedRulesets } from "../sharing";
import { registrationSettings } from "../settings";

import { securityState, beginChallenge } from "./two-factor";

export async function registerUser(input: {
	email: string;
	password: string;
	name?: string;
	inviteCode?: string;
}) {
	const { hash, salt } = await hashPassword(input.password);

	return prisma.$transaction(async (tx) => {
		// Serialize bootstrap and invite redemption, including concurrent first registrations.
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(742901)`;
		const first = (await tx.user.count()) === 0;
		const settings = await registrationSettings(tx);

		if (!first && !settings.registrationsOpen)
			fail(403, "REGISTRATION_CLOSED", "Registration is closed");

		const user = await tx.user.create({
			data: {
				email: input.email,
				name: input.name,
				passwordHash: hash,
				salt,
				isAdmin: first,
				accountRole: first ? "admin" : "normal",
			},
			select: {
				id: true,
				email: true,
				name: true,
				isAdmin: true,
				accountRole: true,
				emailVerifiedAt: true,
				createdAt: true,
			},
		});

		if (input.inviteCode || (!first && settings.inviteOnly))
			await redeemInvite(tx, input.inviteCode, user.id);

		await tx.userSettings.create({
			data: {
				userId: user.id,
				timezone: settings.defaultTimezone,
				firstDayOfWeek: settings.defaultFirstDayOfWeek,
			},
		});

		await seedRulesets(tx, user.id);
		return user;
	});
}

let dummyHash: Promise<{ hash: string; salt: string }> | undefined;

export async function loginUser(
	email: string,
	password: string,
	recovery = false,
) {
	const user = await prisma.user.findUnique({ where: { email } });

	const credentials =
		user ||
		(await (dummyHash ??= hashPassword("dummy-account-comparison")));

	const valid = await verifyPassword(
		password,
		"passwordHash" in credentials
			? credentials.passwordHash
			: credentials.hash,
		credentials.salt,
	);

	if (!user || user.disabled || !valid)
		return fail(401, "INVALID_CREDENTIALS", "Invalid credentials");

	if (!user.passwordHash.startsWith("$argon2id$")) {
		const { hash, salt } = await hashPassword(password);

		const changed = await prisma.user.updateMany({
			where: {
				id: user.id,
				passwordHash: user.passwordHash,
				authVersion: user.authVersion,
			},
			data: { passwordHash: hash, salt },
		});

		if (!changed.count)
			fail(
				401,
				"INVALID_CREDENTIALS",
				"Credentials changed. Sign in again.",
			);
	}

	const state = await securityState(user.id);

	if (state.user.authVersion !== user.authVersion || state.user.disabled)
		fail(401, "INVALID_CREDENTIALS", "Credentials changed. Sign in again.");

	if (state.setupRequired)
		return {
			token: generateToken(user.id, state.user.authVersion, {
				setup: true,
			}),
			user: state.user,
			state: "setup",
		};

	if (state.user.twoFactorMethod !== "none")
		return {
			...(await beginChallenge(
				user.id,
				"login",
				recovery ? "recovery" : undefined,
				user.authVersion,
			)),
			state: "challenge",
		};

	return {
		token: generateToken(user.id, state.user.authVersion),
		user: state.user,
		state: "authenticated",
	};
}
