import { buildApp } from "./app";
import { runDueCalendars } from "./utils/sync";

async function start() {
    const app = await buildApp();
    const address = await app.listen({
        port: Number(process.env.PORT ?? 4000),
        host: "0.0.0.0",
    });
    console.log(`Server listening on ${address}`);
    setInterval(() => runDueCalendars().catch(console.error), 60_000);
}

start().catch(() => process.exit(1));
