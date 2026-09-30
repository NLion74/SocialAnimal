import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { FastifyRequest } from "fastify";
import { fail } from "../../core/http";
import { prisma } from "../../core/database";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET!) throw new Error("JWT_SECRET is required");

const SALT_ROUNDS = 12;

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

export async function hashPassword(
	password: string,
): Promise<{ hash: string; salt: string }> {
	const salt = crypto.randomBytes(32).toString("hex");
	const hash = await bcrypt.hash(password + salt, SALT_ROUNDS);
	return { hash, salt };
}

export async function verifyPassword(
	password: string,
	hash: string,
	salt: string,
): Promise<boolean> {
	return bcrypt.compare(password + salt, hash);
}

export function generateToken(userId: string): string {
	return jwt.sign({ sub: userId }, JWT_SECRET!, { expiresIn: "30d" });
}

export function verifyToken(token: string): { sub: string } {
	return jwt.verify(token, JWT_SECRET!) as { sub: string };
}

export async function authenticateToken(request: FastifyRequest) {
	const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
	if (!token) fail(401, "UNAUTHENTICATED", "Sign in required");
	let sub: string;

	try {
		sub = verifyToken(token!).sub;
		if (typeof sub !== "string") throw new Error();
	} catch {
		return fail(401, "UNAUTHENTICATED", "Invalid or expired session");
	}

	const user = await prisma.user.findUnique({
		where: { id: sub },
		select: { id: true, email: true },
	});

	if (!user) return fail(401, "UNAUTHENTICATED", "Invalid session");
	request.user = user;
}

export async function requireAdmin(userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { isAdmin: true },
	});

	if (!user?.isAdmin) fail(403, "FORBIDDEN", "Administrator access required");
}
