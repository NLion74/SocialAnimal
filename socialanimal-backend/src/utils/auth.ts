import bcrypt from "bcryptjs";
import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "./db";
import { env } from "./env";

export interface RegisterData {
    email: string;
    password: string;
    name?: string;
}

export interface LoginData {
    email: string;
    password: string;
}

export async function register(data: RegisterData) {
    const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
    });

    if (existingUser) {
        throw new Error("User already exists");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
        data: {
            email: data.email,
            passwordHash,
            name: data.name,
        },
        select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
        },
    });

    return user;
}

export async function login(data: LoginData) {
    const user = await prisma.user.findUnique({
        where: { email: data.email },
    });

    if (!user) {
        throw new Error("Invalid credentials");
    }

    const isValidPassword = await bcrypt.compare(
        data.password,
        user.passwordHash,
    );

    if (!isValidPassword) {
        throw new Error("Invalid credentials");
    }

    return {
        user: {
            id: user.id,
            email: user.email,
            name: user.name,
        },
        token: generateToken(user.id),
    };
}

function generateToken(userId: string): string {
    const payload = { sub: userId };
    return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export async function authenticateToken(
    request: FastifyRequest,
    reply: FastifyReply,
) {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return reply.status(401).send({ error: "No token provided" });
        }

        const token = authHeader.substring(7);
        const payload = JSON.parse(Buffer.from(token, "base64").toString());

        const user = await prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, name: true },
        });

        if (!user) {
            return reply.status(401).send({ error: "User not found" });
        }

        (request as any).user = user;
    } catch (err) {
        return reply.status(401).send({ error: "Invalid token" });
    }
}
