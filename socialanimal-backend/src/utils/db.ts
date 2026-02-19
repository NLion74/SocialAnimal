import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare global {
    var prisma: PrismaClient | undefined;
}

const _prisma = globalThis.prisma as PrismaClient | undefined;

const clientOptions: any = {
    log: process.env.NODE_ENV === "development" ? ["query", "error"] : [],
};

if (process.env.DATABASE_URL) {
    try {
        const adapter = new PrismaPg({
            connectionString: process.env.DATABASE_URL,
        });
        clientOptions.adapter = adapter;
    } catch (e) {
        console.error("Failed to initialize PrismaPg adapter:", e);
    }
}

export const prisma = _prisma ?? new PrismaClient(clientOptions);

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
