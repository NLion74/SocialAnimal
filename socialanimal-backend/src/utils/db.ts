import "dotenv/config";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

if (process.env.NODE_ENV !== "development") {
    process.on("beforeExit", async () => {
        await prisma.$disconnect();
    });
}
