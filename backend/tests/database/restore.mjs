import pg from "pg";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import secrets from "../../dist/core/secrets/index.js";
import { snapshot, preserved, catalog } from "./upgrade-support.mjs";

const url = process.env.TEST_DATABASE_URL;

if (!url || !new URL(url).pathname.endsWith("_test"))
	throw new Error("Disposable *_test database required");

secrets.encryptionKey();

const db = new pg.Client({ connectionString: url });

await db.connect();

const restoredUrl = new URL(url);

const name = `socialanimal_restore_${randomBytes(6).toString("hex")}_test`;

await db.query(`CREATE DATABASE "${name}"`);

restoredUrl.pathname = "/" + name;

const directory = await mkdtemp(tmpdir() + "/socialanimal-restore-");

const file = directory + "/backup.dump";

const container = process.env.TEST_PG_CONTAINER;

if (container) {
	const dump = execFileSync("docker", [
		"exec",
		container,
		"pg_dump",
		"-U",
		"postgres",
		"--format=custom",
		new URL(url).pathname.slice(1),
	]);

	await writeFile(file, dump);

	execFileSync(
		"docker",
		[
			"exec",
			"-i",
			container,
			"pg_restore",
			"-U",
			"postgres",
			"--dbname",
			name,
			"--no-owner",
			"--exit-on-error",
		],
		{ input: await readFile(file) },
	);
} else {
	execFileSync("pg_dump", [
		"--dbname",
		url,
		"--format=custom",
		"--file",
		file,
	]);

	execFileSync("pg_restore", [
		"--dbname",
		restoredUrl.toString(),
		"--no-owner",
		"--exit-on-error",
		file,
	]);
}

const restored = new pg.Client({ connectionString: restoredUrl.toString() });

await restored.connect();

await preserved(restored, await snapshot(db));
assert.ok(
	JSON.stringify(await catalog(restored)) ===
		JSON.stringify(await catalog(db)),
	"Restored columns, indexes, constraints and enums match",
);
assert.ok(
	JSON.stringify(
		(await restored.query("SELECT * FROM _prisma_migrations ORDER BY id"))
			.rows,
	) ===
		JSON.stringify(
			(await db.query("SELECT * FROM _prisma_migrations ORDER BY id"))
				.rows,
		),
	"Restored migration history matches",
);

for (const row of (await restored.query('SELECT credentials FROM "Connection"'))
	.rows)
	secrets.decrypt(row.credentials);

for (const row of (
	await restored.query(
		'SELECT "totpSecret" FROM "User" WHERE "totpSecret" IS NOT NULL',
	)
).rows)
	secrets.decrypt(row.totpSecret);

for (const row of (
	await restored.query(
		"SELECT payload FROM \"RecoveryMail\" WHERE payload <> ''",
	)
).rows)
	secrets.decrypt(row.payload);

for (const row of (
	await restored.query(
		'SELECT secret FROM "AuthChallenge" WHERE secret IS NOT NULL',
	)
).rows)
	secrets.decrypt(row.secret);

execFileSync(process.execPath, ["dist/setup-database.js"], {
	env: {
		...process.env,
		DATABASE_URL: restoredUrl.toString(),
		JWT_SECRET: process.env.JWT_SECRET || "restore-test",
	},
	stdio: "pipe",
});

console.log(
	`Restored ${name}; all table contents and encrypted credentials verified. Test backup: ${file}`,
);

await restored.end();

await db.end();
