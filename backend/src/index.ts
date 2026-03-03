import { buildApp } from "./app";
import { runSyncJob } from "./jobs/sync";

async function start() {
    const app = await buildApp();
    const address = await app.listen({
        port: Number(process.env.PORT ?? 4000),
        host: "0.0.0.0",
    });
    console.log(`Server listening on ${address}`);
    setInterval(() => runSyncJob().catch(console.error), 60_000);
}

start().catch((err) => {
    console.error("Startup failed:", err);
    process.exit(1);
});
