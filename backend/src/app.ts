import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import usersRoutes from "./routes/users";
import calendarsRoutes from "./routes/calendars";
import eventsRoutes from "./routes/events";
import friendsRoutes from "./routes/friends";
import providerImportRoutes from "./routes/providers/importRoutes";
import providerExportRoutes from "./routes/providers/exportRoutes";
import providerTestRoutes from "./routes/providers/testRoutes";
import providerDiscoverRoutes from "./routes/providers/discoverRoutes";
import providerGoogleAuthRoutes from "./routes/providers/googleAuthRoutes";

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    await app.register(cors);
    app.get("/health", async () => ({
        status: "ok",
        uptime: process.uptime(),
    }));

    await app.register(usersRoutes, { prefix: "/api/users" });
    await app.register(calendarsRoutes, { prefix: "/api/calendars" });

    await app.register(eventsRoutes, { prefix: "/api/events" });
    await app.register(friendsRoutes, { prefix: "/api/friends" });

    await app.register(providerImportRoutes, {
        prefix: "/api/providers/:type/import",
    });
    await app.register(providerExportRoutes, {
        prefix: "/api/providers/:type/export",
    });
    await app.register(providerTestRoutes, {
        prefix: "/api/providers/:type/test",
    });
    await app.register(providerDiscoverRoutes, {
        prefix: "/api/providers/:type/discover",
    });
    await app.register(providerGoogleAuthRoutes, {
        prefix: "/api/providers/google",
    });

    await app.ready();
    return app;
}
