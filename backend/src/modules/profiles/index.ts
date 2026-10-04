import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../core/database";
import {
	authenticateToken,
	verifyPassword,
	hashPassword,
	passwordChanged,
	securityState,
	verifyToken,
	deleteAccount,
} from "../identity";
import {
	contract,
	obj,
	str,
	bool,
	nullableString,
	date,
	fail,
} from "../../core/http";

const userSchema = obj({
	securitySetupRequired: bool,
	twoFactorMethod: str,
	id: str,
	email: str,
	name: nullableString,
	isAdmin: bool,
	accountRole: {
		type: "string",
		enum: ["admin", "moderator", "normal", "readonly"],
	},
	emailVerifiedAt: nullableString,
	createdAt: date,
});

async function checkPassword(userId: string, password: string) {
	const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

	if (!(await verifyPassword(password, user.passwordHash, user.salt)))
		fail(403, "INVALID_CREDENTIALS", "Password incorrect");

	return user;
}

const routes: FastifyPluginAsync = async (app) => {
	app.addHook("preHandler", authenticateToken);

	app.get("/me", { schema: contract("me", userSchema) }, (req) =>
		securityState(req.user.id).then(({ user, setupRequired }) => ({
			...user,
			securitySetupRequired:
				setupRequired ||
				!!verifyToken(req.headers.authorization!.slice(7)).setup ||
				(user.twoFactorMethod !== "none" &&
					!verifyToken(req.headers.authorization!.slice(7)).mfa),
		})),
	);

	app.patch<{ Body: { name?: string } }>(
		"/me",
		{
			schema: contract("updateMe", userSchema, {
				body: obj({ name: { type: "string", maxLength: 100 } }, []),
			}),
		},
		(req) =>
			prisma.user.update({ where: { id: req.user.id }, data: req.body }),
	);

	app.put<{ Body: { currentPassword: string; newPassword: string } }>(
		"/me/password",
		{
			schema: contract("changePassword", obj({ ok: bool }), {
				body: obj({
					currentPassword: {
						type: "string",
						minLength: 1,
						maxLength: 128,
					},
					newPassword: {
						type: "string",
						minLength: 8,
						maxLength: 128,
					},
				}),
			}),
		},
		async (req) => {
			const user = await checkPassword(
				req.user.id,
				req.body.currentPassword,
			);

			const { hash, salt } = await hashPassword(req.body.newPassword);

			await prisma.$transaction(async (tx) => {
				const changed = await tx.user.updateMany({
					where: {
						id: user.id,
						passwordHash: user.passwordHash,
						authVersion: user.authVersion,
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

				if (!changed.count)
					fail(
						409,
						"CREDENTIALS_CHANGED",
						"Credentials changed. Sign in again.",
					);

				await passwordChanged(tx, user.id, user.email);
			});

			return { ok: true };
		},
	);

	app.delete<{ Body: { password: string } }>(
		"/me",
		{
			schema: contract(
				"deleteMe",
				{ type: "null" },
				{ body: obj({ password: str }) },
				204,
			),
		},
		async (req, reply) => {
			await checkPassword(req.user.id, req.body.password);

			await deleteAccount(req.user.id);

			return reply.code(204).send();
		},
	);
};

export default routes;
