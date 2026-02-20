import Fastify from "fastify";
import cors from "@fastify/cors";
import usersRoutes from "./routes/users";
import calendarsRoutes from "./routes/calendars";
import eventsRoutes from "./routes/events";
import friendsRoutes from "./routes/friends";
import icsRoutes from "./routes/ics";
import { runDueCalendars } from "./utils/sync";

const server = Fastify({ logger: true });

async function start() {
    try {
        await server.register(cors);

        server.register(usersRoutes, { prefix: "/api/users" });
        server.register(calendarsRoutes, { prefix: "/api/calendars" });
        server.register(eventsRoutes, { prefix: "/api/events" });
        server.register(friendsRoutes, { prefix: "/api/friends" });
        server.register(icsRoutes, { prefix: "/api/ics" });

        const address = await server.listen({
            port: Number(process.env.PORT ?? 4000),
            host: "0.0.0.0",
        });
        console.log(`Server listening on ${address}`);

        setInterval(() => runDueCalendars().catch(console.error), 60_000);
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

start();
