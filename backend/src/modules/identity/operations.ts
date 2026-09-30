import { prisma } from "../../core/database";
import { fail } from "../../core/http";
import { hashPassword, verifyPassword, generateToken } from "./auth";
import { redeemInvite } from "../invitations";
import { registrationSettings } from "../settings";

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
			},
			select: {
				id: true,
				email: true,
				name: true,
				isAdmin: true,
				createdAt: true,
			},
		});

		if (!first && settings.inviteOnly)
			await redeemInvite(tx, input.inviteCode, user.id);

		return user;
	});
}

export async function loginUser(email: string, password: string) {
	const user = await prisma.user.findUnique({ where: { email } });

	if (
		!user ||
		!(await verifyPassword(password, user.passwordHash, user.salt))
	)
		return fail(401, "INVALID_CREDENTIALS", "Invalid credentials");

	return { token: generateToken(user.id), user };
}
