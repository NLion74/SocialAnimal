import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID, randomBytes } from "node:crypto";
import { buildApp } from "../../../src/app";
import { prisma } from "../../../src/core/database";
import { decrypt, encrypt, tokenHash } from "../../../src/core/secrets";
import { generateToken, hashPassword } from "../../../src/modules/identity";
import {
	beginChallenge,
	encodeSecret,
	totp,
} from "../../../src/modules/identity/two-factor";

vi.mock("../../../src/core/mail", () => ({
	mailConfigured: () => true,
	sendAccountEmail: vi.fn(),
}));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"Fresh two-factor confirmation for account deletion",
	() => {
		let app: Awaited<ReturnType<typeof buildApp>>;
		let credentials: Awaited<ReturnType<typeof hashPassword>>;
		const password = "deletion-test-password";
		const ids: string[] = [];
		let address = 1;

		const create = async (method = "email", admin = false) => {
			const id = randomUUID();
			ids.push(id);

			return prisma.user.create({
				data: {
					id,
					email: `${id}@example.test`,
					passwordHash: credentials.hash,
					salt: credentials.salt,
					emailVerifiedAt: new Date(),
					twoFactorMethod: method,
					isAdmin: admin,
					accountRole: admin ? "admin" : "normal",
					recoveryCodes: [tokenHash("saved-recovery-code")],
				},
			});
		};

		const request = (
			userId: string,
			method: "POST" | "DELETE",
			path: string,
			payload?: object,
		) =>
			app.inject({
				method,
				url: `/api/v1${path}`,
				payload,
				remoteAddress: `198.51.100.${address++}`,
				headers: {
					authorization: `Bearer ${generateToken(userId, 0, { mfa: true })}`,
				},
			});

		const start = async (id: string) => {
			const response = await request(
				id,
				"POST",
				"/me/deletion-challenges",
				{ password },
			);

			expect(response.statusCode, response.body).toBe(200);
			return response.json().challenge as string;
		};

		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");

			credentials = await hashPassword(password);

			await prisma.appSettings.upsert({
				where: { id: "global" },
				create: { id: "global" },
				update: {
					requireTwoFactor: false,
					requireEmailVerification: false,
				},
			});

			app = await buildApp();
		});

		afterAll(async () => {
			await prisma.recoveryMail.deleteMany({
				where: { userId: { in: ids } },
			});

			await prisma.user.deleteMany({ where: { id: { in: ids } } });
			await app.close();
			await prisma.$disconnect();
		});

		it("rejects password-only deletion, login proofs, and another user's confirmation", async () => {
			const owner = await create(),
				other = await create();

			const missing = await request(owner.id, "DELETE", "/me", {
				password,
			});

			expect(missing.statusCode).toBe(403);
			expect(missing.json().code).toBe("TWO_FACTOR_REQUIRED");

			expect(
				(
					await request(owner.id, "POST", "/me/deletion-challenges", {
						password: "wrong",
					})
				).statusCode,
			).toBe(403);

			const login = await beginChallenge(owner.id, "login");

			expect(
				(
					await request(owner.id, "DELETE", "/me", {
						password,
						confirmation: {
							challenge: login.challenge,
							code: "saved-recovery-code",
						},
					})
				).statusCode,
			).toBe(400);

			const otherProof = await start(other.id);

			expect(
				(
					await request(owner.id, "DELETE", "/me", {
						password,
						confirmation: {
							challenge: otherProof,
							code: "saved-recovery-code",
						},
					})
				).statusCode,
			).toBe(400);

			expect(
				await prisma.user.findUnique({ where: { id: owner.id } }),
			).not.toBeNull();
		});

		it("persists failed attempts, expires confirmations, and rejects old credential versions", async () => {
			const owner = await create();
			const challenge = await start(owner.id);

			for (let i = 0; i < 5; i++)
				expect(
					(
						await request(owner.id, "DELETE", "/me", {
							password,
							confirmation: { challenge, code: "incorrect" },
						})
					).statusCode,
				).toBe(400);

			expect(
				(
					await prisma.authChallenge.findUniqueOrThrow({
						where: { id: tokenHash(challenge) },
					})
				).attempts,
			).toBe(5);

			expect(
				(
					await request(owner.id, "DELETE", "/me", {
						password,
						confirmation: {
							challenge,
							code: "saved-recovery-code",
						},
					})
				).statusCode,
			).toBe(400);

			await prisma.authChallenge.update({
				where: { id: tokenHash(challenge) },
				data: { attempts: 0, expiresAt: new Date(0) },
			});

			expect(
				(
					await request(owner.id, "DELETE", "/me", {
						password,
						confirmation: {
							challenge,
							code: "saved-recovery-code",
						},
					})
				).statusCode,
			).toBe(400);

			await prisma.authChallenge.update({
				where: { id: tokenHash(challenge) },
				data: {
					expiresAt: new Date(Date.now() + 60000),
					authVersion: 99,
				},
			});

			expect(
				(
					await request(owner.id, "DELETE", "/me", {
						password,
						confirmation: {
							challenge,
							code: "saved-recovery-code",
						},
					})
				).statusCode,
			).toBe(400);
		});

		it("deletes only after the emailed deletion code and removes the challenge and queued mail atomically", async () => {
			const owner = await create();
			const challenge = await start(owner.id);

			const job = await prisma.recoveryMail.findFirstOrThrow({
				where: { userId: owner.id, kind: "code" },
			});

			const payload = decrypt(job.payload);
			expect(payload.action).toBe("account-deletion");

			const response = await request(owner.id, "DELETE", "/me", {
				password,
				confirmation: { challenge, code: payload.token },
			});

			expect(response.statusCode, response.body).toBe(204);

			expect(
				await prisma.user.findUnique({ where: { id: owner.id } }),
			).toBeNull();

			expect(
				await prisma.authChallenge.count({
					where: { userId: owner.id },
				}),
			).toBe(0);

			expect(
				await prisma.recoveryMail.count({
					where: { userId: owner.id },
				}),
			).toBe(0);
		});

		it("accepts a fresh authenticator code and retains password-only deletion when no factor is enabled", async () => {
			const owner = await create("totp");
			const secret = encodeSecret(randomBytes(20));

			await prisma.user.update({
				where: { id: owner.id },
				data: { totpSecret: encrypt({ secret }) },
			});

			const challenge = await start(owner.id);

			const response = await request(owner.id, "DELETE", "/me", {
				password,
				confirmation: {
					challenge,
					code: totp(secret, Math.floor(Date.now() / 30000)),
				},
			});

			expect(response.statusCode, response.body).toBe(204);
			const simple = await create("none");

			expect(
				(await request(simple.id, "DELETE", "/me", { password }))
					.statusCode,
			).toBe(204);
		});

		it("requires the acting admin's factor and binds a one-use recovery confirmation to its target", async () => {
			const admin = await create("email", true),
				target = await create("none"),
				other = await create("none");

			const path = `/admin/users/${target.id}`;

			expect((await request(admin.id, "DELETE", path)).statusCode).toBe(
				403,
			);

			const response = await request(
				admin.id,
				"POST",
				`${path}/deletion-challenges`,
				{},
			);

			expect(response.statusCode, response.body).toBe(200);

			const confirmation = {
				challenge: response.json().challenge,
				code: "saved-recovery-code",
			};

			expect(
				(
					await request(
						admin.id,
						"DELETE",
						`/admin/users/${other.id}`,
						{ confirmation },
					)
				).statusCode,
			).toBe(400);

			const deleted = await request(admin.id, "DELETE", path, {
				confirmation,
			});

			expect(deleted.statusCode, deleted.body).toBe(204);

			expect(
				(
					await prisma.user.findUniqueOrThrow({
						where: { id: admin.id },
					})
				).recoveryCodes,
			).toEqual([]);

			expect(
				(
					await request(
						admin.id,
						"DELETE",
						`/admin/users/${other.id}`,
						{ confirmation },
					)
				).statusCode,
			).toBe(400);

			expect(
				await prisma.user.findUnique({ where: { id: other.id } }),
			).not.toBeNull();
		});
	},
);
