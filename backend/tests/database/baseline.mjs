// Create the supported historical baseline through Prisma, including checksums.
import pg from "pg";
import { deployProductionBaseline } from "./upgrade-support.mjs";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
	throw new Error("TEST_DATABASE_URL must name a disposable *_test database");
const db = new pg.Client({ connectionString: url });
await db.connect();
try {
	if (
		(await db.query("SELECT 1 FROM pg_tables WHERE schemaname='public'"))
			.rowCount
	)
		throw new Error("Baseline requires an empty database");
	deployProductionBaseline(url);
	console.log("Production baseline and 14 migration checksums established.");
} finally {
	await db.end();
}
