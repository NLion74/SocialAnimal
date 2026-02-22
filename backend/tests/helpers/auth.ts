import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "changeme-secret";

export function generateTestToken(userId: string): string {
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function createAuthHeader(userId: string): { authorization: string } {
    return { authorization: `Bearer ${generateTestToken(userId)}` };
}

export function createQueryToken(userId: string): string {
    return generateTestToken(userId);
}
