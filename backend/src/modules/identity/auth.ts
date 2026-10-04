import jwt from "jsonwebtoken";
import { FastifyRequest } from "fastify";
import { fail } from "../../core/http";
import { prisma } from "../../core/database";

import { securityState } from "./two-factor";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET!) throw new Error("JWT_SECRET is required");

export { hashPassword, verifyPassword } from "./passwords";

export const authSchema = {
	security: [{ bearerAuth: [] }],
	response: {
		401: {
			type: "object",
			properties: {
				error: { type: "string" },
			},
		},
	},
};

export interface AuthRequest extends FastifyRequest {
	user: { id: string; email: string };
}

export function generateToken(
	userId: string,
	authVersion = 0,
	security: { mfa?: boolean; setup?: boolean } = {},
): string {
	return jwt.sign(
		{
			sub: userId,
			ver: authVersion,
			...security,
			authAt: Math.floor(Date.now() / 1000),
		},
		JWT_SECRET!,
		{
			expiresIn: "30d",
		},
	);
}

export function verifyToken(token: string): {
	sub: string;
	ver?: number;
	mfa?: boolean;
	setup?: boolean;
	authAt?: number;
} {
	return jwt.verify(token, JWT_SECRET!, { algorithms: ["HS256"] }) as {
		sub: string;
		ver?: number;
		mfa?: boolean;
		setup?: boolean;
		authAt?: number;
	};
}

export async function authenticateToken(request: FastifyRequest) {
	const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
	if (!token) fail(401, "UNAUTHENTICATED", "Sign in required");
	let sub: string;
	let version: number;

	try {
		const claims = verifyToken(token!);
		sub = claims.sub;
		version = claims.ver ?? 0;
		if (!Number.isSafeInteger(version) || version < 0) throw new Error();
		if (typeof sub !== "string") throw new Error();
	} catch {
		return fail(401, "UNAUTHENTICATED", "Invalid or expired session");
	}

	const user = await prisma.user.findUnique({
		where: { id: sub },
		select: {
			id: true,
			email: true,
			disabled: true,
			authVersion: true,
			accountRole: true,
			isAdmin: true,
			emailVerifiedAt: true,
		},
	});

	if (!user || user.disabled || user.authVersion !== version)
		return fail(401, "UNAUTHENTICATED", "Invalid session");

	request.user = user;
	const path = request.routeOptions.url || "";
	const security = await securityState(user.id);
	const claims = verifyToken(token!);

	const safeRead =
		request.method === "GET" &&
		["/api/v1/me", "/api/v1/me/settings", "/api/v1/me/security"].includes(
			path,
		);

	const verificationRequest =
		request.method === "POST" &&
		path === "/api/v1/me/email-verification-requests";

	const limited =
		security.setupRequired ||
		claims.setup ||
		(security.user.twoFactorMethod !== "none" && !claims.mfa);

	if (limited && !safeRead && !verificationRequest)
		fail(
			403,
			"SECURITY_SETUP_REQUIRED",
			"Complete account security setup or sign in again to continue",
		);

	const readOnlyPost =
		request.method === "POST" && path.endsWith("/previews");

	if (
		user.accountRole === "readonly" &&
		!["GET", "HEAD", "OPTIONS"].includes(request.method) &&
		!readOnlyPost &&
		!verificationRequest &&
		!path.startsWith("/api/v1/me/two-factor")
	)
		fail(403, "READ_ONLY", "This demo account is read-only");

	const settings = await prisma.appSettings.findUnique({
		where: { id: "global" },
		select: { requireEmailVerification: true },
	});

	if (
		settings?.requireEmailVerification &&
		!user.emailVerifiedAt &&
		!user.isAdmin &&
		!path.startsWith("/api/v1/me")
	)
		fail(
			403,
			"EMAIL_VERIFICATION_REQUIRED",
			"Verify your email before using calendars and sharing",
		);
}

export async function requireAdmin(userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { isAdmin: true, disabled: true },
	});

	if (!user?.isAdmin || user.disabled)
		fail(403, "FORBIDDEN", "Administrator access required");
}

export function requireRecentAuthentication(request: FastifyRequest) {
	const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
	const claims = verifyToken(token || "");

	if (!claims.authAt || Date.now() / 1000 - claims.authAt > 300)
		fail(
			403,
			"REAUTHENTICATION_REQUIRED",
			"Sign in again before changing security settings",
		);
}
