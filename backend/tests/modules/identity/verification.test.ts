import { runRecoveryTick } from "../../../src/modules/identity/recovery";
import { createServer, type Server } from "node:net";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { buildApp } from "../../../src/app";
import { prisma } from "../../../src/core/database";
import { sendAccountEmail } from "../../../src/core/mail";
import { generateToken } from "../../../src/modules/identity";

// Real SMTP transport against a disposable local mail sink; no mail leaves the machine.
describe.skipIf(!process.env.TEST_DATABASE_URL)(
	"Email verification over SMTP",
	() => {
		let server: Server,
			app: Awaited<ReturnType<typeof buildApp>>,
			userId: string;

		const messages: string[] = [];

		const headers = () => ({
			authorization: `Bearer ${generateToken(userId)}`,
		});

		const token = () =>
			messages
				.at(-1)!
				.replace(/=\r?\n/g, "")
				.match(/verify-email#([A-Za-z0-9_-]{43})/)![1];

		const resend = () =>
			app.inject({
				method: "POST",
				url: "/api/v1/me/email-verification-requests",
				headers: headers(),
			});

		const verify = (value: string) =>
			app.inject({
				method: "POST",
				url: "/api/v1/auth/email-verifications",
				payload: { token: value },
			});

		beforeAll(async () => {
			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");

			await prisma.recoveryMail.deleteMany();

			if (
				!new URL(process.env.TEST_DATABASE_URL!).pathname.endsWith(
					"_test",
				)
			)
				throw new Error("Disposable database required");

			server = createServer((socket) => {
				socket.write("220 localhost SMTP\r\n");

				let buffer = "",
					data = false,
					message = "";

				socket.on("data", (chunk) => {
					buffer += chunk.toString();
					let index: number;

					while ((index = buffer.indexOf("\r\n")) >= 0) {
						const line = buffer.slice(0, index);
						buffer = buffer.slice(index + 2);

						if (data) {
							if (line === ".") {
								messages.push(message);
								message = "";
								data = false;
								socket.write("250 Accepted\r\n");
							} else message += line + "\r\n";
						} else if (/^EHLO/.test(line))
							socket.write("250-localhost\r\n250 PIPELINING\r\n");
						else if (line === "DATA") {
							data = true;
							socket.write("354 Send message\r\n");
						} else if (line === "QUIT") socket.end("221 Bye\r\n");
						else socket.write("250 OK\r\n");
					}
				});
			});

			await new Promise<void>((resolve) =>
				server.listen(0, "127.0.0.1", resolve),
			);

			vi.stubEnv("SMTP_HOST", "127.0.0.1");

			vi.stubEnv(
				"SMTP_PORT",
				String((server.address() as { port: number }).port),
			);

			vi.stubEnv("SMTP_FROM", "noreply@example.test");
			vi.stubEnv("SMTP_REQUIRE_TLS", "false");
			vi.stubEnv("SMTP_SECURE", "false");
			vi.stubEnv("SMTP_USER", "");
			vi.stubEnv("PUBLIC_URL", "https://calendar.example.test");
			app = await buildApp();

			await prisma.appSettings.upsert({
				where: { id: "global" },
				create: { id: "global" },
				update: {
					registrationsOpen: true,
					inviteOnly: false,
					requireEmailVerification: true,
				},
			});
		});

		afterAll(async () => {
			await prisma.appSettings.update({
				where: { id: "global" },
				data: { requireEmailVerification: false },
			});

			if (userId) await prisma.user.delete({ where: { id: userId } });
			await app.close();
			await prisma.$disconnect();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			vi.unstubAllEnvs();
		});

		it("sends a registration email, keeps only a hash, and rejects rapid resends", async () => {
			const response = await app.inject({
				method: "POST",
				url: "/api/v1/auth/registrations",
				payload: {
					email: `${randomUUID()}@example.test`,
					password: "test-password",
				},
			});

			expect(response.statusCode, response.body).toBe(201);
			userId = response.json().id;
			await runRecoveryTick();
			expect(messages).toHaveLength(1);
			const raw = token();

			const row = await prisma.emailVerification.findUniqueOrThrow({
				where: { userId },
			});

			expect(row.tokenHash).not.toContain(raw);
			expect(response.body).not.toContain(raw);
			expect(+row.expiresAt - Date.now()).toBeGreaterThan(23 * 3600000);
			expect((await resend()).statusCode).toBe(429);

			expect(
				(
					await app.inject({
						url: "/api/v1/me",
						headers: { authorization: `Bearer ${raw}` },
					})
				).statusCode,
			).toBe(401);
		});

		it("invalidates old links on resend and consumes a token exactly once", async () => {
			const old = token();

			await prisma.emailVerification.update({
				where: { userId },
				data: { lastSentAt: new Date(0) },
			});

			expect((await resend()).statusCode).toBe(202);
			await runRecoveryTick();
			expect((await verify(old)).statusCode).toBe(400);

			const responses = await Promise.all([
				verify(token()),
				verify(token()),
			]);

			expect(responses.map((r) => r.statusCode).sort()).toEqual([
				200, 400,
			]);

			expect(
				(await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
					.emailVerifiedAt,
			).toBeTruthy();
		});

		it("rejects expired tokens and binds tokens to the email address", async () => {
			await prisma.user.update({
				where: { id: userId },
				data: { emailVerifiedAt: null },
			});

			await prisma.emailVerification.update({
				where: { userId },
				data: { lastSentAt: new Date(0) },
			});

			await resend();
			await runRecoveryTick();

			await prisma.emailVerification.update({
				where: { userId },
				data: { expiresAt: new Date(0) },
			});

			expect((await verify(token())).statusCode).toBe(400);

			await prisma.emailVerification.update({
				where: { userId },
				data: { lastSentAt: new Date(0) },
			});

			await resend();
			await runRecoveryTick();

			await prisma.user.update({
				where: { id: userId },
				data: { email: `${randomUUID()}@changed.test` },
			});

			expect((await verify(token())).statusCode).toBe(400);

			expect(
				(await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
					.emailVerifiedAt,
			).toBeNull();
		});

		it("allows optional verification and honors already issued links", async () => {
			await prisma.emailVerification.update({
				where: { userId },
				data: { lastSentAt: new Date(0) },
			});

			expect((await resend()).statusCode).toBe(202);
			await runRecoveryTick();
			const pending = token();

			await prisma.appSettings.update({
				where: { id: "global" },
				data: { requireEmailVerification: false },
			});

			const count = messages.length;

			expect((await resend()).json().code).toBe(
				"VERIFICATION_RATE_LIMIT",
			);

			const response = await app.inject({
				method: "POST",
				url: "/api/v1/auth/registrations",
				payload: {
					email: `${randomUUID()}@example.test`,
					password: "test-password",
				},
			});

			expect(response.statusCode).toBe(201);
			await runRecoveryTick();
			expect(messages).toHaveLength(count + 1);
			expect((await verify(pending)).statusCode).toBe(200);
			await prisma.user.delete({ where: { id: response.json().id } });
		});

		it("delivers reset links and change notifications over the real SMTP transport", async () => {
			const value = "R".repeat(43);
			await sendAccountEmail("recovery@example.test", "reset", value);
			const reset = messages.at(-1)!.replace(/=\r?\n/g, "");

			expect(reset).toContain(
				`https://calendar.example.test/reset-password#${value}`,
			);

			expect(reset).toContain("30 minutes");
			await sendAccountEmail("recovery@example.test", "changed");

			expect(messages.at(-1)!.replace(/=\r?\n/g, "")).toContain(
				"existing sessions were signed out",
			);

			expect(messages.at(-1)).not.toContain(value);
		});
	},
);
