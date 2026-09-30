import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../../core/database";
import { authenticateToken, verifyPassword, hashPassword } from "../identity";
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
	id: str,
	email: str,
	name: nullableString,
	isAdmin: bool,
	createdAt: date,
});

async function checkPassword(userId: string, password: string) {
	const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

	if (!(await verifyPassword(password, user.passwordHash, user.salt)))
		fail(403, "INVALID_CREDENTIALS", "Password incorrect");
}

const routes: FastifyPluginAsync = async (app) => {
	app.addHook("preHandler", authenticateToken);

	app.get("/me", { schema: contract("me", userSchema) }, (req) =>
		prisma.user.findUniqueOrThrow({ where: { id: req.user.id } }),
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
					currentPassword: str,
					newPassword: {
						type: "string",
						minLength: 8,
						maxLength: 72,
					},
				}),
			}),
		},
		async (req) => {
			await checkPassword(req.user.id, req.body.currentPassword);
			const { hash, salt } = await hashPassword(req.body.newPassword);

			await prisma.user.update({
				where: { id: req.user.id },
				data: { passwordHash: hash, salt },
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

			await prisma.$transaction([
				prisma.calendar.deleteMany({ where: { userId: req.user.id } }),
				prisma.user.delete({ where: { id: req.user.id } }),
			]);

			return reply.code(204).send();
		},
	);
};

export default routes;
