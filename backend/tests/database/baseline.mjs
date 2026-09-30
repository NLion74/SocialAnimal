// Applies only committed historical migrations to an EMPTY disposable database.
// Never uses schema push, reset, or rewrites migration history.
import pg from "pg";
import { readdir, readFile, writeFile } from "node:fs/promises";

const url = process.env.TEST_DATABASE_URL;

if (!url || !new URL(url).pathname.endsWith("_test"))
	throw new Error("TEST_DATABASE_URL must name a disposable *_test database");

const db = new pg.Client({ connectionString: url });

await db.connect();

if (
	(
		await db.query(
			`SELECT tablename FROM pg_tables WHERE schemaname='public'`,
		)
	).rows.length
)
	throw new Error("Baseline requires an empty database");

for (const name of (await readdir("prisma/migrations")).sort()) {
	if (
		name > "20260305102000_add_default_tab_to_user_settings" ||
		name === "migration_lock.toml"
	)
		continue;

	await db.query(
		await readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
	);
}

const columns = (
	await db.query(
		`SELECT table_name, column_name, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`,
	)
).rows;

await writeFile(
	"tests/database/baseline-columns.json",
	JSON.stringify(columns, null, "\t") + "\n",
);

console.log(
	`Established baseline: ${columns.length} columns. Historical defaultSharePermission is retained.`,
);

await db.end();
