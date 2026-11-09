import {
	reconcileHighlights,
	deliverNotification,
} from "./modules/notifications";
import { runRecoveryTick } from "./modules/identity";
import { buildApp } from "./app";
import { prisma } from "./core/database";
import { encryptionKey } from "./core/secrets";
import { startRunner } from "./core/jobs";
import { runSyncTick, validateConnections } from "./modules/integrations";
import { logProcessFailure } from "./core/http/logging";

async function start() {
	encryptionKey();
	await prisma.$connect();
	await validateConnections();
	const app = await buildApp();

	await app.listen({
		port: Number(process.env.PORT ?? 4000),
		host: "0.0.0.0",
	});

	app.log.info("Backend ready; database and provider credentials validated");

	const stop = startRunner(() => runSyncTick(app.log), 15000, {
		name: "calendar-sync",
		logger: app.log,
	});

	const stopMail = startRunner(
		() => runRecoveryTick(app.log, deliverNotification),
		5000,
		{
			name: "email-delivery",
			logger: app.log,
		},
	);

	const stopNotifications = startRunner(reconcileHighlights, 15000, {
		name: "notifications",
		logger: app.log,
	});

	let stopping = false;

	const shutdown = async () => {
		if (stopping) return;
		stopping = true;
		app.log.info("Backend shutting down");

		try {
			await Promise.all([
				app.close(),
				stop(),
				stopMail(),
				stopNotifications(),
			]);
			await prisma.$disconnect();
			// The development watcher keeps an IPC channel open after cleanup.
			process.exit(0);
		} catch (error) {
			app.log.error({ err: error }, "Server shutdown failed");
			process.exit(1);
		}
	};

	process.once("SIGTERM", () => void shutdown());
	process.once("SIGINT", () => void shutdown());
}

start().catch(async (error) => {
	logProcessFailure(
		"Startup failed: check database schema, calendar connections, JWT_SECRET, and CREDENTIAL_ENCRYPTION_KEY",
		error,
	);

	await prisma.$disconnect();
	process.exitCode = 1;
});
