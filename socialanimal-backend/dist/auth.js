"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.authenticateToken = authenticateToken;
const bcrypt_1 = __importDefault(require("bcrypt"));
const db_1 = require("./db");
async function register(data) {
    const existingUser = await db_1.prisma.user.findUnique({
        where: { email: data.email },
    });
    if (existingUser) {
        throw new Error("User already exists");
    }
    const passwordHash = await bcrypt_1.default.hash(data.password, 10);
    const user = await db_1.prisma.user.create({
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
async function login(data) {
    const user = await db_1.prisma.user.findUnique({
        where: { email: data.email },
    });
    if (!user) {
        throw new Error("Invalid credentials");
    }
    const isValidPassword = await bcrypt_1.default.compare(data.password, user.passwordHash);
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
function generateToken(userId) {
    const payload = { sub: userId };
    return Buffer.from(JSON.stringify(payload)).toString("base64");
}
async function authenticateToken(request, reply) {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return reply.status(401).send({ error: "No token provided" });
        }
        const token = authHeader.substring(7);
        const payload = JSON.parse(Buffer.from(token, "base64").toString());
        const user = await db_1.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { id: true, email: true, name: true },
        });
        if (!user) {
            return reply.status(401).send({ error: "User not found" });
        }
        request.user = user;
    }
    catch (err) {
        return reply.status(401).send({ error: "Invalid token" });
    }
}
