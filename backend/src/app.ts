import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import usersRoutes from "./routes/users";
import calendarsRoutes from "./routes/calendars";
import eventsRoutes from "./routes/events";
import friendsRoutes from "./routes/friends";
import icsRoutes from "./routes/ics";

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    await app.register(cors);

    await app.register(usersRoutes, { prefix: "/api/users" });
    await app.register(calendarsRoutes, { prefix: "/api/calendars" });
    await app.register(eventsRoutes, { prefix: "/api/events" });
    await app.register(friendsRoutes, { prefix: "/api/friends" });
    await app.register(icsRoutes, { prefix: "/api/ics" });

    await app.ready();
    return app;
}
