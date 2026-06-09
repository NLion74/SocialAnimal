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
    user: { id: string; email: string; role?: string };
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
    // Only accept Authorization header for authentication.
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) return authHeader.substring(7);
    return null;
}

// Export token helpers: sign and verify short-lived export tokens used for
// calendar share links. These are HMAC-signed strings and MUST NOT be
// accepted as full auth tokens by `authenticateToken`.
export function signExportToken(
    userId: string,
    calendarId: string,
    ttlMinutes: number = 60,
): string {
    const expires = Math.floor(Date.now() / 1000) + ttlMinutes * 60;
    const payload = `${userId}.${calendarId}.${expires}`;
    const hmac = crypto.createHmac("sha256", JWT_SECRET);
    hmac.update(payload);
    const sig = hmac.digest("hex");
    return `${payload}.${sig}`;
}

export function verifyExportToken(token: string): { userId: string; calendarId: string } {
    const parts = token.split(".");
    if (parts.length !== 4) throw new Error("Invalid export token");
    const [userId, calendarId, expiresStr, sig] = parts;
    const expires = parseInt(expiresStr, 10);
    if (Number.isNaN(expires) || expires < Math.floor(Date.now() / 1000)) {
        throw new Error("Export token expired");
    }
    const payload = `${userId}.${calendarId}.${expires}`;
    const hmac = crypto.createHmac("sha256", JWT_SECRET);
    hmac.update(payload);
    const expected = hmac.digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
        throw new Error("Invalid export token");
    }
    return { userId, calendarId };
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
            select: { id: true, email: true, name: true, role: true },
        });
        if (!user) return reply.status(401).send({ error: "User not found" });
        (request as any).user = user;

        // no role-based muting performed here
    } catch {
        return reply.status(401).send({ error: "Invalid or expired token" });
    }
}

export function signOAuthState(userId: string): string {
    const hmac = crypto.createHmac("sha256", JWT_SECRET);
    hmac.update(userId);
    const signature = hmac.digest("hex");
    return `${userId}.${signature}`;
}

export function verifyOAuthState(state: string): string | null {
    const dotIndex = state.lastIndexOf(".");
    if (dotIndex === -1) return null;
    const userId = state.substring(0, dotIndex);
    const signature = state.substring(dotIndex + 1);
    const hmac = crypto.createHmac("sha256", JWT_SECRET);
    hmac.update(userId);
    const expected = hmac.digest("hex");
    if (signature.length !== expected.length) return null;
    if (
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ) {
        return null;
    }
    return userId;
}
