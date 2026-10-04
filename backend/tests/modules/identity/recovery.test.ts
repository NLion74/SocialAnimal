import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../../src/app";
import { prisma } from "../../../src/core/database";
import { decrypt, opaqueToken, tokenHash } from "../../../src/core/secrets";
import { hashPassword, generateToken } from "../../../src/modules/identity";
import {
	requestPasswordReset,
	runRecoveryTick,
} from "../../../src/modules/identity/recovery";

const mail = vi.hoisted(() => ({
	configured: true,
	send: vi.fn(async () => {}),
}));

vi.mock("../../../src/core/mail", () => ({
	mailConfigured: () => mail.configured,
	sendAccountEmail: mail.send,
}));

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"Password recovery security",
	() => {
		let app: Awaited<ReturnType<typeof buildApp>>;

		const userId = randomUUID(),
			adminId = randomUUID(),
			demoId = randomUUID();

		const email = `${userId}@example.test`;
		let address = 0;

		const request = (
			url: string,
			payload?: object,
			actor?: string,
			method: "POST" | "PUT" | "GET" = "POST",
		) =>
			app.inject({
				method,
				url: `/api/v1${url}`,
				payload,
				remoteAddress: `192.0.2.${++address}`,
				headers: actor
					? { authorization: `Bearer ${generateToken(actor)}` }
					: {},
			});

		const seed = async (overrides: Record<string, unknown> = {}) => {
			const token = opaqueToken();

			const user = await prisma.user.findUniqueOrThrow({
				where: { id: userId },
			});

			await prisma.passwordReset.create({
				data: {
					userId,
					email,
					tokenHash: tokenHash(token),
					authVersion: user.authVersion,
					expiresAt: new Date(Date.now() + 60000),
					...overrides,
				},
			});

			return token;
		};

		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");

			await prisma.recoveryMail.deleteMany();
			await prisma.recoveryThrottle.deleteMany();
			const { hash, salt } = await hashPassword("original-password");

			await prisma.user.createMany({
				data: [userId, adminId, demoId].map((id) => ({
					id,
					email: `${id}@example.test`,
					passwordHash: hash,
					salt,
					isAdmin: id === adminId,
					accountRole:
						id === adminId
							? "admin"
							: id === demoId
								? "readonly"
								: "normal",
				})),
			});

			app = await buildApp();
		});

		afterAll(async () => {
			await prisma.user.deleteMany({
				where: { id: { in: [userId, adminId, demoId] } },
			});

			await prisma.recoveryMail.deleteMany();
			await prisma.recoveryThrottle.deleteMany();
			await app.close();
			await prisma.$disconnect();
		});

		it("queues equal public responses without storing plaintext recipients or tokens", async () => {
			const known = await request("/auth/password-reset-requests", {
				email,
			});

			const unknown = await request("/auth/password-reset-requests", {
				email: `unknown-${userId}@example.test`,
			});

			expect(known.statusCode).toBe(202);
			expect(unknown.json()).toEqual(known.json());
			const jobs = await prisma.recoveryMail.findMany();

			expect(
				jobs.every((job) => !job.payload.includes("@example.test")),
			).toBe(true);

			await runRecoveryTick();
			expect(mail.send).toHaveBeenCalledTimes(1);

			expect(
				await prisma.passwordReset.count({ where: { userId } }),
			).toBe(1);

			expect(
				await prisma.recoveryMail.count({
					where: {
						status: { in: ["queued", "running", "retrying"] },
					},
				}),
			).toBe(0);

			expect(
				(await prisma.recoveryMail.findMany()).every(
					(job) => job.payload === "",
				),
			).toBe(true);
		});

		it("only administrators can send resets for eligible accounts", async () => {
			expect(
				(
					await request(
						`/admin/users/${userId}/password-reset-requests`,
						undefined,
						userId,
					)
				).statusCode,
			).toBe(403);

			expect(
				(
					await request(
						`/admin/users/${userId}/password-reset-requests`,
						undefined,
						adminId,
					)
				).statusCode,
			).toBe(202);

			expect(
				(
					await request(
						`/admin/users/${demoId}/password-reset-requests`,
						undefined,
						adminId,
					)
				).statusCode,
			).toBe(403);
		});

		it("retries SMTP failures using the same encrypted token and recovers expired leases", async () => {
			await prisma.recoveryMail.deleteMany();
			await requestPasswordReset(email);
			mail.send.mockRejectedValueOnce(new Error("SMTP private details"));
			await runRecoveryTick();
			const job = await prisma.recoveryMail.findFirstOrThrow();
			expect(job.kind).toBe("reset");
			expect(job.attempts).toBe(1);
			const token = decrypt(job.payload).token;
			expect(job.payload).not.toContain(token);

			await prisma.recoveryMail.update({
				where: { id: job.id },
				data: { availableAt: new Date(0), leaseUntil: new Date(0) },
			});

			await runRecoveryTick();
			expect(mail.send).toHaveBeenLastCalledWith(email, "reset", token);

			expect(
				await prisma.recoveryMail.count({
					where: {
						status: { in: ["queued", "running", "retrying"] },
					},
				}),
			).toBe(0);

			expect(
				(await prisma.recoveryMail.findMany()).every(
					(job) => job.payload === "",
				),
			).toBe(true);
		});

		it("rejects expired links, disabled/demo accounts, and invalid tokens", async () => {
			const token = await seed({ expiresAt: new Date(0) });

			expect(
				(
					await request("/auth/password-resets", {
						token,
						password: "new-password",
					})
				).statusCode,
			).toBe(400);

			const valid = await seed();

			await prisma.user.update({
				where: { id: userId },
				data: { disabled: true },
			});

			expect(
				(
					await request("/auth/password-resets", {
						token: valid,
						password: "new-password",
					})
				).statusCode,
			).toBe(400);

			await prisma.user.update({
				where: { id: userId },
				data: { disabled: false, accountRole: "readonly" },
			});

			expect(
				(
					await request("/auth/password-resets", {
						token: valid,
						password: "new-password",
					})
				).statusCode,
			).toBe(400);

			await prisma.user.update({
				where: { id: userId },
				data: { accountRole: "normal" },
			});
		});

		it("consumes a reset exactly once, invalidates all reset links and existing sessions", async () => {
			const token = await seed();
			const other = await seed();

			await prisma.oAuthFlow.create({
				data: {
					userId,
					stateHash: tokenHash(opaqueToken()),
					expiresAt: new Date(Date.now() + 60000),
				},
			});

			const results = await Promise.all(
				[1, 2].map(() =>
					request("/auth/password-resets", {
						token,
						password: "replacement-password",
					}),
				),
			);

			expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);

			expect(
				(
					await request("/auth/password-resets", {
						token: other,
						password: "another-password",
					})
				).statusCode,
			).toBe(400);

			expect(
				(await request("/me", undefined, userId, "GET")).statusCode,
			).toBe(401);

			expect(await prisma.oAuthFlow.count({ where: { userId } })).toBe(0);

			const login = await request("/auth/sessions", {
				email,
				password: "replacement-password",
			});

			expect(login.statusCode).toBe(200);
			expect(login.body).not.toContain("passwordHash");

			expect(
				(await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
					.emailVerifiedAt,
			).toBeNull();

			await runRecoveryTick();
			expect(mail.send).toHaveBeenCalledWith(email, "changed", undefined);
		});

		it("password changes invalidate sessions and cannot race a stale password check", async () => {
			const user = await prisma.user.findUniqueOrThrow({
				where: { id: userId },
			});

			const headers = {
				authorization: `Bearer ${generateToken(userId, user.authVersion)}`,
			};

			const results = await Promise.all(
				[1, 2].map(() =>
					app.inject({
						method: "PUT",
						url: "/api/v1/me/password",
						headers,
						payload: {
							currentPassword: "replacement-password",
							newPassword: "changed-again-password",
						},
					}),
				),
			);

			expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);

			expect(
				(
					await app.inject({
						method: "GET",
						url: "/api/v1/me",
						headers,
					})
				).statusCode,
			).toBe(401);
		});

		it("enforces persistent per-address throttles and uniform unavailable-mail responses", async () => {
			const recipient = `limited-${userId}@example.test`;

			for (let i = 0; i < 8; i++)
				expect(
					(
						await request("/auth/password-reset-requests", {
							email: recipient,
						})
					).statusCode,
				).toBe(202);

			expect(
				(
					await prisma.recoveryThrottle.findUniqueOrThrow({
						where: { key: tokenHash(recipient) },
					})
				).count,
			).toBe(5);

			mail.configured = false;

			expect(
				(await request("/auth/password-reset-requests", { email }))
					.statusCode,
			).toBe(503);

			expect(
				(
					await request("/auth/password-reset-requests", {
						email: recipient,
					})
				).statusCode,
			).toBe(503);

			mail.configured = true;
		});
	},
);
