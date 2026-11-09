import type { FastifyPluginAsync } from "fastify";
import { requestPasswordReset, resetPassword } from "./recovery";
import { password } from "./schemas";
import {
	authenticateToken,
	requireRecentAuthentication,
	verifyToken,
} from "./auth";
import { requestVerification, confirmVerification } from "./verification";
import { mailConfigured } from "../../core/mail";
import { obj, str, contract, bool } from "../../core/http";
import { userSchema, login, registration } from "./schemas";
import { registerUser, loginUser } from "./operations";

import {
	beginChallenge,
	completeChallenge,
	resetFactor,
	securityState,
} from "./two-factor";

const sessionSchema = obj(
	{
		token: str,
		user: userSchema,
		state: str,
		challenge: str,
		method: str,
		expiresAt: str,
		recoveryCodes: { type: "array", items: str },
	},
	[],
);

const routes: FastifyPluginAsync = async (app) => {
	app.post<{ Body: { challenge: string; code: string } }>(
		"/auth/challenge-completions",
		{
			schema: contract("completeLoginChallenge", sessionSchema, {
				body: obj({
					challenge: { ...str, minLength: 43, maxLength: 43 },
					code: { ...str, minLength: 6, maxLength: 32 },
				}),
			}),
		},
		(req) => completeChallenge(req.body.challenge, req.body.code, "login"),
	);

	app.get(
		"/me/security",
		{
			preHandler: authenticateToken,
			schema: contract(
				"mySecurity",
				obj({ method: str, required: bool, setupRequired: bool }),
			),
		},
		async (req) => {
			const state = await securityState(req.user.id);

			return {
				method: state.user.twoFactorMethod,
				required: state.required,
				setupRequired: state.setupRequired,
			};
		},
	);

	app.post<{ Body: { method: string } }>(
		"/me/two-factor-enrollments",
		{
			preHandler: authenticateToken,
			schema: contract(
				"beginTwoFactorEnrollment",
				obj(
					{
						challenge: str,
						method: str,
						expiresAt: str,
						secret: str,
						uri: str,
					},
					["challenge", "method", "expiresAt"],
				),
				{
					body: obj({
						method: { type: "string", enum: ["email", "totp"] },
					}),
				},
			),
		},
		(req) => {
			requireRecentAuthentication(req);

			return beginChallenge(
				req.user.id,
				"enroll",
				req.body.method,
				verifyToken(req.headers.authorization!.slice(7)).ver ?? 0,
			);
		},
	);

	app.post<{ Body: { challenge: string; code: string } }>(
		"/me/two-factor-enrollment-completions",
		{
			preHandler: authenticateToken,
			schema: contract("completeTwoFactorEnrollment", sessionSchema, {
				body: obj({
					challenge: { ...str, minLength: 43, maxLength: 43 },
					code: { ...str, minLength: 6, maxLength: 6 },
				}),
			}),
		},
		(req) => {
			requireRecentAuthentication(req);

			return completeChallenge(
				req.body.challenge,
				req.body.code,
				"enroll",
				req.user.id,
			);
		},
	);

	app.delete(
		"/me/two-factor",
		{
			preHandler: authenticateToken,
			schema: contract("disableTwoFactor", obj({ ok: bool })),
		},
		async (req) => {
			requireRecentAuthentication(req);

			await resetFactor(
				req.user.id,
				undefined,
				verifyToken(req.headers.authorization!.slice(7)).ver ?? 0,
			);

			return { ok: true };
		},
	);

	app.post<{ Body: { email: string } }>(
		"/auth/password-reset-requests",
		{
			schema: contract(
				"requestPasswordReset",
				obj({ accepted: bool }),
				{
					body: obj({
						email: {
							type: "string",
							format: "email",
							maxLength: 254,
						},
					}),
				},
				202,
			),
		},
		async (req, reply) => {
			await requestPasswordReset(req.body.email);
			return reply.code(202).send({ accepted: true });
		},
	);

	app.post<{ Body: { token: string; password: string } }>(
		"/auth/password-resets",
		{
			schema: contract("resetPassword", obj({ ok: bool }), {
				body: obj({
					token: { type: "string", minLength: 43, maxLength: 43 },
					password,
				}),
			}),
		},
		async (req) => {
			await resetPassword(req.body.token, req.body.password);
			return { ok: true };
		},
	);

	app.post(
		"/me/email-verification-requests",
		{
			preHandler: authenticateToken,
			schema: contract(
				"requestEmailVerification",
				obj({ accepted: bool }),
				{},
				202,
			),
		},
		async (req, reply) => {
			await requestVerification(req.user.id);
			return reply.code(202).send({ accepted: true });
		},
	);

	app.post<{ Body: { token: string } }>(
		"/auth/email-verifications",
		{
			schema: contract(
				"confirmEmailVerification",
				obj({ verified: bool }),
				{
					body: obj({
						token: { type: "string", minLength: 1, maxLength: 128 },
					}),
				},
			),
		},
		async (req) => {
			await confirmVerification(req.body.token);
			return { verified: true };
		},
	);

	app.post<{
		Body: {
			email: string;
			password: string;
			name?: string;
			inviteCode?: string;
		};
	}>(
		"/auth/registrations",
		{
			schema: contract(
				"register",
				userSchema,
				{ body: registration },
				201,
			),
		},
		async (req, reply) => {
			const user = await registerUser(req.body);
			// Account creation succeeds even if SMTP is temporarily unavailable; resend is available after login.
			if (mailConfigured())
				await requestVerification(user.id).catch(() => {});

			return reply.code(201).send(user);
		},
	);

	app.post<{ Body: { email: string; password: string; recovery?: boolean } }>(
		"/auth/sessions",
		{
			schema: contract("login", sessionSchema, {
				body: login,
			}),
		},
		(req) =>
			loginUser(req.body.email, req.body.password, req.body.recovery),
	);
};

export default routes;
