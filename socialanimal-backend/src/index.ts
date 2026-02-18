import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma, disconnectDb } from "./utils/db";
import { env } from "./utils/env";
import usersRoutes from "./routes/users";
import calendarsRoutes from "./routes/calendars";
import eventsRoutes from "./routes/events";
import friendsRoutes from "./routes/friends";
import icsRoutes from "./routes/ics";

const server = Fastify({ logger: true });

async function start() {
    try {
        await server.register(cors);

        server.get("/health", async () => ({ status: "ok" }));

        server.register(usersRoutes, { prefix: "/api/users" });
        server.register(calendarsRoutes, { prefix: "/api/calendars" });
        server.register(eventsRoutes, { prefix: "/api/events" });
        server.register(friendsRoutes, { prefix: "/api/friends" });
        server.register(icsRoutes, { prefix: "/api/ics" });

        const address = await server.listen({
            port: env.PORT,
            host: "0.0.0.0",
        });
        console.log(`Server listening on ${address}`);
    } catch (err) {
        server.log.error(err);
        await disconnectDb();
        process.exit(1);
    }
}

process.on("SIGTERM", async () => {
    await disconnectDb();
    await server.close();
});
process.on("SIGINT", async () => {
    await disconnectDb();
    await server.close();
});

start();
