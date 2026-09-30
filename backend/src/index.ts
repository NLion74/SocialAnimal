import { buildApp } from "./app";
import { prisma } from "./core/database";
import { encryptionKey } from "./core/secrets";
import { startRunner } from "./core/jobs";
import { runSyncTick, validateConnections } from "./modules/integrations";

async function start() {
	encryptionKey();
	await prisma.$connect();
	await validateConnections();
	const app = await buildApp();

	await app.listen({
		port: Number(process.env.PORT ?? 4000),
		host: "0.0.0.0",
	});

	const stop = startRunner(runSyncTick);

	const shutdown = async () => {
		await app.close();
		await stop();
		await prisma.$disconnect();
	};

	process.once("SIGTERM", () => void shutdown());
	process.once("SIGINT", () => void shutdown());
}

start().catch(async () => {
	console.error(
		"Startup failed: check database migrations, connection backfill, JWT_SECRET, and CREDENTIAL_ENCRYPTION_KEY",
	);

	await prisma.$disconnect();
	process.exitCode = 1;
});
