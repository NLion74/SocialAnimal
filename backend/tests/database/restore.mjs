import pg from "pg";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import secrets from "../../dist/core/secrets/index.js";

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

for (const table of [
	"User",
	"UserSettings",
	"Calendar",
	"Event",
	"Friendship",
	"CalendarShare",
	"InviteCode",
	"AppSettings",
	"Connection",
	"Subscription",
	"OAuthFlow",
	"SyncRun",
]) {
	const query = `SELECT * FROM "${table}" ORDER BY id`;

	assert.deepEqual(
		(await restored.query(query)).rows,
		(await db.query(query)).rows,
		table,
	);
}

for (const row of (await restored.query('SELECT credentials FROM "Connection"'))
	.rows)
	secrets.decrypt(row.credentials);

console.log(
	`Restored ${name}; all table contents and encrypted credentials verified. Test backup: ${file}`,
);

await restored.end();

await db.end();
