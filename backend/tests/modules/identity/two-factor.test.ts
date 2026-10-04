import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../../../src/app";
import { prisma } from "../../../src/core/database";
import { decrypt, encrypt, tokenHash } from "../../../src/core/secrets";
import { generateToken, hashPassword } from "../../../src/modules/identity";
import {
	beginChallenge,
	completeChallenge,
	encodeSecret,
	resetFactor,
	totp,
} from "../../../src/modules/identity/two-factor";
import { runRecoveryTick } from "../../../src/modules/identity/recovery";

const mail = vi.hoisted(() => ({ send: vi.fn(async () => {}) }));

vi.mock("../../../src/core/mail", () => ({
	mailConfigured: () => true,
	sendAccountEmail: mail.send,
}));

it("matches the RFC 6238 SHA-1 test vector with six digits", () => {
	expect(totp(encodeSecret(Buffer.from("12345678901234567890")), 1)).toBe(
		"287082",
	);
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"Two-factor authentication and account lifecycle",
	() => {
		const owner = randomUUID(),
			admin = randomUUID();

		let app: Awaited<ReturnType<typeof buildApp>>;
		let address = 1;
		const password = "test-secure-password";
		const email = `${owner}@example.test`;

		const request = (
			method: "GET" | "POST" | "PATCH" | "DELETE",
			path: string,
			body?: object,
			token?: string,
		) =>
			app.inject({
				method,
				url: `/api/v1${path}`,
				payload: body,
				remoteAddress: `192.0.2.${address++}`,
				headers: token ? { authorization: `Bearer ${token}` } : {},
			});

		const login = () =>
			request("POST", "/auth/sessions", { email, password });

		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");

			const { hash, salt } = await hashPassword(password);

			await prisma.user.createMany({
				data: [
					{ id: owner, email, passwordHash: hash, salt },
					{
						id: admin,
						email: `${admin}@example.test`,
						passwordHash: hash,
						salt,
						isAdmin: true,
						accountRole: "admin",
						emailVerifiedAt: new Date(),
					},
				],
			});

			app = await buildApp();
		});

		beforeEach(async () => {
			await prisma.appSettings.upsert({
				where: { id: "global" },
				create: { id: "global" },
				update: {
					requireTwoFactor: false,
					requireEmailVerification: false,
				},
			});

			await prisma.user.update({
				where: { id: owner },
				data: {
					twoFactorMethod: "none",
					authVersion: 0,
					totpSecret: null,
					totpLastStep: null,
					recoveryCodes: [],
					emailVerifiedAt: new Date(),
					securitySetupRequired: false,
				},
			});

			await prisma.authChallenge.deleteMany({ where: { userId: owner } });
			await prisma.recoveryMail.deleteMany();

			await prisma.emailVerification.deleteMany({
				where: { userId: owner },
			});
		});

		afterAll(async () => {
			await prisma.appSettings.update({
				where: { id: "global" },
				data: {
					requireTwoFactor: false,
					requireEmailVerification: false,
				},
			});

			await prisma.recoveryMail.deleteMany();

			await prisma.user.deleteMany({
				where: { id: { in: [owner, admin] } },
			});

			await app.close();
			await prisma.$disconnect();
		});

		it("automatically enables email under forced policy and fences existing password-only sessions", async () => {
			await prisma.appSettings.update({
				where: { id: "global" },
				data: { requireTwoFactor: true },
			});

			expect(
				(
					await request(
						"GET",
						"/calendars",
						undefined,
						generateToken(owner),
					)
				).statusCode,
			).toBe(403);

			const result = await login();
			expect(result.statusCode, result.body).toBe(200);

			expect(result.json()).toMatchObject({
				state: "challenge",
				method: "email",
			});

			expect(result.json().token).toBeUndefined();

			expect(
				(
					await request(
						"GET",
						"/me",
						undefined,
						result.json().challenge,
					)
				).statusCode,
			).toBe(401);

			const job = await prisma.recoveryMail.findFirstOrThrow({
				where: { userId: owner, kind: "code" },
			});

			const code = decrypt(job.payload).token;
			expect(job.payload).not.toContain(code);

			const completed = await request(
				"POST",
				"/auth/challenge-completions",
				{ challenge: result.json().challenge, code },
			);

			expect(completed.statusCode, completed.body).toBe(200);

			expect(
				(
					await request(
						"GET",
						"/calendars",
						undefined,
						completed.json().token,
					)
				).statusCode,
			).toBe(200);

			expect(
				(
					await request("POST", "/auth/challenge-completions", {
						challenge: result.json().challenge,
						code,
					})
				).statusCode,
			).toBe(400);
		});

		it("allows only setup access until email is verified, then requires a new factor sign-in", async () => {
			await prisma.user.update({
				where: { id: owner },
				data: { emailVerifiedAt: null },
			});

			await prisma.appSettings.update({
				where: { id: "global" },
				data: { requireTwoFactor: true },
			});

			const result = await login();
			expect(result.json().state).toBe("setup");
			const token = result.json().token;

			expect(
				(await request("GET", "/me", undefined, token)).statusCode,
			).toBe(200);

			expect(
				(
					await request(
						"PATCH",
						"/me",
						{ name: "Cannot change" },
						token,
					)
				).statusCode,
			).toBe(403);

			expect(
				(
					await request(
						"POST",
						"/me/email-verification-requests",
						undefined,
						token,
					)
				).statusCode,
			).toBe(202);

			const job = await prisma.recoveryMail.findFirstOrThrow({
				where: { userId: owner, kind: "verify" },
			});

			expect(
				(
					await request("POST", "/auth/email-verifications", {
						token: decrypt(job.payload).token,
					})
				).statusCode,
			).toBe(200);

			expect(
				(await request("GET", "/calendars", undefined, token))
					.statusCode,
			).toBe(403);

			expect((await login()).json().method).toBe("email");
		});

		it("limits guesses and cancels superseded code deliveries", async () => {
			await prisma.user.update({
				where: { id: owner },
				data: { twoFactorMethod: "email" },
			});

			const challenge = await beginChallenge(owner, "login");

			const job = await prisma.recoveryMail.findFirstOrThrow({
				where: { userId: owner, kind: "code" },
			});

			const realCode = decrypt(job.payload).token;

			for (let i = 0; i < 5; i++)
				await expect(
					completeChallenge(
						challenge.challenge,
						realCode === "000000" ? "111111" : "000000",
						"login",
					),
				).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });

			await expect(
				completeChallenge(challenge.challenge, realCode, "login"),
			).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });

			await runRecoveryTick();

			expect(
				(
					await prisma.recoveryMail.findUniqueOrThrow({
						where: { id: job.id },
					})
				).status,
			).toBe("cancelled");
		});

		it("confirms authenticator enrollment, stores encrypted seeds, and prevents code reuse", async () => {
			const challenge = await beginChallenge(owner, "enroll", "totp");

			const code = totp(
				challenge.secret!,
				Math.floor(Date.now() / 30000),
			);

			const result = await completeChallenge(
				challenge.challenge,
				code,
				"enroll",
				owner,
			);

			expect(result.recoveryCodes).toHaveLength(10);

			const user = await prisma.user.findUniqueOrThrow({
				where: { id: owner },
			});

			expect(user.totpSecret).not.toContain(challenge.secret!);
			expect(user.recoveryCodes).not.toContain(result.recoveryCodes![0]);

			expect(
				(await request("GET", "/me", undefined, generateToken(owner)))
					.statusCode,
			).toBe(401);

			const next = await beginChallenge(owner, "login");

			await expect(
				completeChallenge(next.challenge, code, "login"),
			).rejects.toMatchObject({ code: "INVALID_CHALLENGE" });

			await completeChallenge(
				next.challenge,
				result.recoveryCodes![0],
				"login",
			);

			expect(
				(await prisma.user.findUniqueOrThrow({ where: { id: owner } }))
					.recoveryCodes,
			).not.toContain(tokenHash(result.recoveryCodes![0]));
		});

		it("consumes a valid TOTP exactly once under concurrent completion", async () => {
			const secret = encodeSecret(Buffer.alloc(20, 7));

			await prisma.user.update({
				where: { id: owner },
				data: {
					twoFactorMethod: "totp",
					totpSecret: encrypt({ secret }),
				},
			});

			const challenge = await beginChallenge(owner, "login");

			const result = await Promise.allSettled(
				[1, 2].map(() =>
					completeChallenge(
						challenge.challenge,
						totp(secret, Math.floor(Date.now() / 30000)),
						"login",
					),
				),
			);

			expect(
				result.filter((row) => row.status === "fulfilled"),
			).toHaveLength(1);
		});

		it("requires admin privilege for deletion and factor reset, revokes sessions on reset", async () => {
			expect(
				(
					await request(
						"DELETE",
						`/admin/users/${admin}`,
						undefined,
						generateToken(owner),
					)
				).statusCode,
			).toBe(403);

			const reset = await request(
				"POST",
				`/admin/users/${owner}/two-factor-resets`,
				undefined,
				generateToken(admin),
			);

			expect(reset.statusCode, reset.body).toBe(200);

			expect(
				(await request("GET", "/me", undefined, generateToken(owner)))
					.statusCode,
			).toBe(401);

			expect((await login()).json().state).toBe("setup");
		});

		it("deletes owned data and revokes unused invitations", async () => {
			const target = randomUUID();

			await prisma.user.create({
				data: {
					id: target,
					email: `${target}@example.test`,
					passwordHash: "unused",
				},
			});

			const calendar = await prisma.calendar.create({
				data: {
					userId: target,
					name: "Delete me",
					type: "ics",
					syncInterval: 0,
				},
			});

			const ruleset = await prisma.permissionRuleset.create({
				data: {
					userId: target,
					name: "Full",
					fallback: "full",
					rules: [],
				},
			});

			await prisma.calendarShare.create({
				data: {
					calendarId: calendar.id,
					sharedWithId: owner,
					rulesetId: ruleset.id,
				},
			});

			await prisma.subscription.create({
				data: {
					calendarId: calendar.id,
					issuerId: owner,
					tokenHash: randomUUID(),
					ceiling: "full",
				},
			});

			await prisma.friendship.create({
				data: { user1Id: target, user2Id: owner, status: "accepted" },
			});

			const invite = await prisma.inviteCode.create({
				data: { createdBy: target, code: randomUUID() },
			});

			const response = await request(
				"DELETE",
				`/admin/users/${target}`,
				undefined,
				generateToken(admin),
			);

			expect(response.statusCode, response.body).toBe(204);

			expect(
				await prisma.user.findUnique({ where: { id: target } }),
			).toBeNull();

			expect(
				await prisma.calendar.findUnique({
					where: { id: calendar.id },
				}),
			).toBeNull();

			expect(
				await prisma.subscription.count({
					where: { calendarId: calendar.id },
				}),
			).toBe(0);

			expect(
				(
					await prisma.inviteCode.findUniqueOrThrow({
						where: { id: invite.id },
					})
				).revokedAt,
			).not.toBeNull();

			await prisma.inviteCode.delete({ where: { id: invite.id } });
		});

		it("does not disable a factor after the authorizing session has been invalidated", async () => {
			await prisma.user.update({
				where: { id: owner },
				data: { twoFactorMethod: "email", authVersion: 1 },
			});

			await expect(
				resetFactor(owner, undefined, 0),
			).rejects.toMatchObject({ statusCode: 401 });

			expect(
				(await prisma.user.findUniqueOrThrow({ where: { id: owner } }))
					.twoFactorMethod,
			).toBe("email");
		});

		it("cannot delete the last active administrator", async () => {
			const others = await prisma.user.findMany({
				where: { isAdmin: true, disabled: false, id: { not: admin } },
				select: { id: true },
			});

			await prisma.user.updateMany({
				where: { id: { in: others.map((row) => row.id) } },
				data: { disabled: true },
			});

			try {
				const response = await request(
					"DELETE",
					`/admin/users/${admin}`,
					undefined,
					generateToken(admin),
				);

				expect(response.statusCode, response.body).toBe(409);
				expect(response.json().code).toBe("LAST_ADMIN");
			} finally {
				await prisma.user.updateMany({
					where: { id: { in: others.map((row) => row.id) } },
					data: { disabled: false },
				});
			}
		});

		it("keeps sanitized job history and clears completed jobs without removing pending mail", async () => {
			const pending = await prisma.recoveryMail.create({
				data: {
					kind: "verify",
					payload: encrypt({ email, token: "secret" }),
					userId: owner,
					expiresAt: new Date(Date.now() + 60000),
				},
			});

			await prisma.recoveryMail.create({
				data: {
					kind: "changed",
					payload: "",
					status: "sent",
					finishedAt: new Date(),
					expiresAt: new Date(),
				},
			});

			const logs = await request(
				"GET",
				"/admin/email-jobs",
				undefined,
				generateToken(admin),
			);

			expect(logs.statusCode, logs.body).toBe(200);
			expect(logs.body).not.toContain("payload");
			expect(logs.body).not.toContain(email);

			await request(
				"DELETE",
				"/admin/email-jobs",
				undefined,
				generateToken(admin),
			);

			expect(
				await prisma.recoveryMail.findUnique({
					where: { id: pending.id },
				}),
			).not.toBeNull();
		});
	},
);
