import { execFileSync } from "node:child_process";
import { prisma } from "./core/database";
import { ensurePermissionsSchema } from "./core/database/permissions-schema";
import { initializePermissions } from "./modules/sharing";
import { encryptionKey } from "./core/secrets";
import { validateConnections } from "./modules/integrations";

async function main() {
	encryptionKey();

	const tables = await prisma.$queryRaw<
		Array<{ table_name: string }>
	>`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;

	if (!tables.length) {
		execFileSync(
			process.execPath,
			["node_modules/prisma/build/index.js", "db", "push"],
			{ stdio: "inherit" },
		);
	}

	await ensurePermissionsSchema();
	await initializePermissions();

	// Prisma cannot express these queue invariants in its schema.
	// Existing databases are never reset or automatically schema-pushed.
	await prisma.$transaction(async (tx) => {
		await tx.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "SyncRun_one_active_calendar" ON "SyncRun" ("calendarId") WHERE "status" IN ('queued', 'running')`;

		await tx.$executeRaw`DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SyncRun_status_check' AND conrelid = '"SyncRun"'::regclass) THEN
				ALTER TABLE "SyncRun" ADD CONSTRAINT "SyncRun_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed'));
			END IF;
		END $$`;
	});

	await validateConnections();
	console.log("Database ready");
}

main()
	.catch(() => {
		console.error(
			"Database setup failed. Check DATABASE_URL, CREDENTIAL_ENCRYPTION_KEY, and that the database schema matches this application version. Existing data has been preserved.",
		);

		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
