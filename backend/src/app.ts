import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import usersRoutes from "./routes/users";
import calendarsRoutes from "./routes/calendars";
import eventsRoutes from "./routes/events";
import friendsRoutes from "./routes/friends";
import icsSubscriptionRoutes from "./routes/export/subscription/ics";
import importRoutes from "./routes/import";

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    await app.register(cors);
    app.get("/health", async () => ({
        status: "ok",
        uptime: process.uptime(),
    }));

    await app.register(usersRoutes, { prefix: "/api/users" });
    await app.register(calendarsRoutes, { prefix: "/api/calendars" });
    await app.register(importRoutes, { prefix: "/api/import" });
    await app.register(icsSubscriptionRoutes, {
        prefix: "/api/export/subscription/ics",
    });
    await app.register(eventsRoutes, { prefix: "/api/events" });
    await app.register(friendsRoutes, { prefix: "/api/friends" });

    await app.ready();
    return app;
}
