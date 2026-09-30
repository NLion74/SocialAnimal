import { execFileSync } from "node:child_process";
import { encryptionKey } from "./core/secrets";
import { prisma } from "./core/database";
import { backfillConnections } from "./modules/integrations";

let stage:
	"encryption configuration" | "schema deployment" | "credential backfill" =
	"encryption configuration";

async function main() {
	encryptionKey();
	stage = "schema deployment";

	execFileSync(
		process.execPath,
		["node_modules/prisma/build/index.js", "migrate", "deploy"],
		{ stdio: "inherit" },
	);

	stage = "credential backfill";
	const count = await backfillConnections();

	console.log(
		`Migration and credential validation complete (${count} calendars backfilled)`,
	);
}

main()
	.catch((error: unknown) => {
		const hints = {
			"encryption configuration":
				"Set CREDENTIAL_ENCRYPTION_KEY to a persistent 64-character hexadecimal key. Keep the existing key when credentials have already been encrypted.",
			"schema deployment":
				"Check the Prisma error above and DATABASE_URL; do not reset the database.",
			"credential backfill":
				"Check that CREDENTIAL_ENCRYPTION_KEY matches the saved credentials and that all calendar connections belong to their owners. Completed batches can be resumed.",
		};

		console.error(`Database setup failed during ${stage}. ${hints[stage]}`);
		const code = (error as { code?: unknown })?.code;

		if (typeof code === "string" && /^[A-Z0-9_]+$/.test(code))
			console.error(`Error code: ${code}`);

		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
