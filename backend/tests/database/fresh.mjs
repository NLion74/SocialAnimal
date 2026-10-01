import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import pg from "pg";

const url = process.env.TEST_DATABASE_URL;

if (!url || !new URL(url).pathname.endsWith("_test"))
	throw new Error("Disposable *_test database required");

const db = new pg.Client({ connectionString: url });

await db.connect();

assert.equal(
	(
		await db.query(
			"SELECT * FROM information_schema.tables WHERE table_schema = 'public'",
		)
	).rowCount,
	0,
	"Fresh database required",
);

const setup = () =>
	execFileSync(process.execPath, ["dist/setup-database.js"], {
		env: { ...process.env, DATABASE_URL: url },
		stdio: "inherit",
	});

setup();

assert.equal(
	(
		await db.query(
			"SELECT to_regclass('public._prisma_migrations') AS history",
		)
	).rows[0].history,
	null,
);

await db.query(
	`INSERT INTO "User" (id, email, "passwordHash") VALUES ('fresh-user', 'fresh@example.test', 'preserved')`,
);

setup();

assert.equal(
	(
		await db.query(
			`SELECT "passwordHash" FROM "User" WHERE id = 'fresh-user'`,
		)
	).rows[0].passwordHash,
	"preserved",
);

assert.equal(
	(
		await db.query(
			`SELECT indexname FROM pg_indexes WHERE indexname = 'SyncRun_one_active_calendar'`,
		)
	).rowCount,
	1,
);

console.log(
	"Fresh schema initialization and repeated setup preserve data and queue constraints.",
);

await db.end();
