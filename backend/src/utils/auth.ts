import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "./db";

const JWT_SECRET = process.env.JWT_SECRET ?? "changeme-secret";
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
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { sub: string } {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
}

function extractToken(request: FastifyRequest): string | null {
    const query = (request.query as any).token;
    if (query) return query;

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) return authHeader.substring(7);

    return null;
}

export async function authenticateToken(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    try {
        const token = extractToken(request);
        if (!token)
            return reply.status(401).send({ error: "No token provided" });

        const payload = verifyToken(token);
        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, name: true },
        });
        if (!user) return reply.status(401).send({ error: "User not found" });
        (request as any).user = user;
    } catch {
        return reply.status(401).send({ error: "Invalid or expired token" });
    }
}
