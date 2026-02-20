import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
    var prisma: any | undefined;
}

const _prisma = globalThis.prisma as any | undefined;

const clientOptions: any = {
    log: process.env.NODE_ENV === "development" ? ["query", "error"] : [],
};

if (process.env.DATABASE_URL) {
    try {
        const adapter = new PrismaPg({
            connectionString: process.env.DATABASE_URL,
        });
        clientOptions.adapter = adapter;
    } catch {
        console.error("Failed to initialize PrismaPg adapter");
    }
}

let PrismaClientCtor: any;
try {
    PrismaClientCtor = require("@prisma/client").PrismaClient;
} catch {
    PrismaClientCtor = undefined;
}

export const prisma =
    _prisma ??
    (PrismaClientCtor ? new PrismaClientCtor(clientOptions) : ({} as any));

if (process.env.NODE_ENV === "development") globalThis.prisma = prisma;

export async function disconnectDb() {
    await prisma.$disconnect().catch(() => {});
}

const shutdown = () => disconnectDb();

if (!(globalThis as any).__prisma_shutdown_handlers_installed) {
    (globalThis as any).__prisma_shutdown_handlers_installed = true;
    process.on("beforeExit", shutdown);
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}
