import { deployProductionBaseline } from "./upgrade-support.mjs";
// Exercise the same setup entrypoint used by Compose, from real migration history.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import secrets from "../../dist/core/secrets/index.js";
import {
	snapshot,
	preserved,
	verifyUpgrade,
	catalog,
} from "./upgrade-support.mjs";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
	throw Error("Disposable *_test database required");
const admin = new pg.Client({ connectionString: url });
await admin.connect();
const names = [];
const clients = [];
async function database() {
	const name = "upgrade_" + randomBytes(6).toString("hex") + "_test";
	await admin.query(`CREATE DATABASE "${name}"`);
	names.push(name);
	const target = new URL(url);
	target.pathname = "/" + name;
	const db = new pg.Client({ connectionString: target.toString() });
	await db.connect();
	clients.push(db);
	return { db, url: target.toString() };
}
function command(target, overrides = {}) {
	const env = { ...process.env, DATABASE_URL: target, ...overrides };
	if (process.env.SETUP_IMAGE)
		return {
			file: "docker",
			args: [
				"run",
				"--rm",
				"--network",
				"host",
				"-e",
				"DATABASE_URL",
				"-e",
				"JWT_SECRET",
				"-e",
				"CREDENTIAL_ENCRYPTION_KEY",
				process.env.SETUP_IMAGE,
				"node",
				"dist/setup-database.js",
			],
			env,
		};
	return { file: process.execPath, args: ["dist/setup-database.js"], env };
}
function setup(target, success = true, overrides = {}) {
	const c = command(target, overrides);
	const r = spawnSync(c.file, c.args, {
		env: c.env,
		encoding: "utf8",
		timeout: 60000,
	});
	assert.equal(
		r.status === 0,
		success,
		`Setup status mismatch: ${r.stdout} ${r.stderr}`,
	);
	return r;
}
async function baseline(target) {
	deployProductionBaseline(target.url);
	await target.db.query(
		readFileSync("tests/database/production-baseline.sql", "utf8"),
	);
}
try {
	const upgraded = await database();
	await baseline(upgraded);
	const before = await snapshot(upgraded.db);
	setup(upgraded.url, false, {
		CREDENTIAL_ENCRYPTION_KEY: "invalid-private-key",
	});
	await preserved(upgraded.db, before);
	assert.equal(
		(await upgraded.db.query("SELECT count(*) FROM _prisma_migrations"))
			.rows[0].count,
		"14",
	);
	setup(upgraded.url);
	await preserved(upgraded.db, before);
	await verifyUpgrade(upgraded.db, secrets.decrypt);
	const after = await snapshot(upgraded.db);
	setup(upgraded.url);
	await preserved(upgraded.db, after);
	setup(upgraded.url, false, { CREDENTIAL_ENCRYPTION_KEY: "cd".repeat(32) });
	await preserved(upgraded.db, after);
	const migration = (
		await upgraded.db.query(
			"SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name LIMIT 1",
		)
	).rows[0];
	await upgraded.db.query(
		"UPDATE _prisma_migrations SET checksum=$1 WHERE migration_name=$2",
		["0".repeat(64), migration.migration_name],
	);
	const checksumFailure = setup(upgraded.url, false);
	assert.match(checksumFailure.stderr, /checksum/);
	await preserved(upgraded.db, after);
	await upgraded.db.query(
		"UPDATE _prisma_migrations SET checksum=$1 WHERE migration_name=$2",
		[migration.checksum, migration.migration_name],
	);
	const fresh = await database();
	setup(fresh.url);
	assert.ok(
		JSON.stringify(await catalog(upgraded.db)) ===
			JSON.stringify(await catalog(fresh.db)),
		"Fresh/upgrade catalog parity",
	);
	await upgraded.db.query(
		`UPDATE "PermissionRuleset" SET name='Edited default',fallback='hidden' WHERE "userId"='owner' AND "seedKey"='full'`,
	);
	const edited = await snapshot(upgraded.db);
	setup(upgraded.url);
	await preserved(upgraded.db, edited);
	const unknown = await database();
	await unknown.db.query(
		"CREATE TABLE historical (value text); INSERT INTO historical VALUES ('keep')",
	);
	setup(unknown.url, false);
	assert.equal(
		(await unknown.db.query("SELECT value FROM historical")).rows[0].value,
		"keep",
	);
	// The migration fails part way through; its explicit transaction must roll back every DDL change.
	const failed = await database();
	await baseline(failed);
	await failed.db.query('CREATE TABLE "Connection" (sentinel text)');
	const failedBefore = await snapshot(failed.db);
	const failure = setup(failed.url, false);
	assert.match(failure.stderr, /migrate-deploy/);
	await preserved(failed.db, failedBefore);
	assert.equal(
		(
			await failed.db.query(
				`SELECT 1 FROM information_schema.columns WHERE table_name='User' AND column_name='accountRole'`,
			)
		).rowCount,
		0,
	);
	await failed.db.query('DROP TABLE "Connection"');
	const resolve = spawnSync(
		process.execPath,
		[
			"node_modules/prisma/build/index.js",
			"migrate",
			"resolve",
			"--rolled-back",
			"20261109120000_application_upgrade",
		],
		{ env: { ...process.env, DATABASE_URL: failed.url }, encoding: "utf8" },
	);
	assert.equal(resolve.status, 0);
	setup(failed.url);
	await verifyUpgrade(failed.db, secrets.decrypt);
	// Freeze the second backfill transaction after the first has committed, then kill setup.
	const interrupted = await database();
	await baseline(interrupted);
	await interrupted.db.query(
		`CREATE FUNCTION pause_upgrade_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='calendar-fastmail' AND NEW."connectionId" IS NOT NULL THEN PERFORM pg_advisory_xact_lock(742904); END IF; RETURN NEW; END $$; CREATE TRIGGER pause_upgrade BEFORE UPDATE ON "Calendar" FOR EACH ROW EXECUTE FUNCTION pause_upgrade_test()`,
	);
	await interrupted.db.query("SELECT pg_advisory_lock(742904)");
	const c = command(interrupted.url);
	const containerName = "upgrade-interrupt-" + randomBytes(6).toString("hex");
	if (process.env.SETUP_IMAGE) c.args.splice(2, 0, "--name", containerName);
	const stop = () => {
		if (process.env.SETUP_IMAGE)
			spawnSync("docker", ["kill", "--signal", "KILL", containerName], {
				stdio: "ignore",
			});
		else child.kill("SIGTERM");
	};
	const child = spawn(c.file, c.args, { env: c.env, stdio: "ignore" });
	const finished = new Promise((resolve) => child.once("exit", resolve));
	let committed = false;
	try {
		for (let i = 0; i < 300; i++) {
			const exists = (
				await interrupted.db.query(
					`SELECT to_regclass('public."Connection"') AS table`,
				)
			).rows[0].table;
			if (
				exists &&
				Number(
					(
						await interrupted.db.query(
							'SELECT count(*) FROM "Connection"',
						)
					).rows[0].count,
				) > 0
			) {
				committed = true;
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		assert.ok(
			committed,
			"First backfill transaction committed before interruption",
		);
		stop();
		await finished;
	} finally {
		if (process.env.SETUP_IMAGE)
			spawnSync("docker", ["rm", "-f", containerName], {
				stdio: "ignore",
			});
		child.kill("SIGKILL");
		await interrupted.db.query("SELECT pg_advisory_unlock(742904)");
	}
	const progress = (
		await interrupted.db.query(
			'SELECT id,credentials FROM "Connection" ORDER BY id',
		)
	).rows;
	assert.ok(
		progress.length > 0 && progress.length < 6,
		"Only committed backfill progress retained",
	);
	await interrupted.db.query(
		'DROP TRIGGER pause_upgrade ON "Calendar"; DROP FUNCTION pause_upgrade_test()',
	);
	const partial = await snapshot(interrupted.db);
	setup(interrupted.url, false, {
		CREDENTIAL_ENCRYPTION_KEY: "cd".repeat(32),
	});
	await preserved(interrupted.db, partial);
	setup(interrupted.url);
	await verifyUpgrade(interrupted.db, secrets.decrypt);
	for (const row of progress)
		assert.ok(
			(
				await interrupted.db.query(
					'SELECT credentials FROM "Connection" WHERE id=$1',
					[row.id],
				)
			).rows[0].credentials === row.credentials,
			"Completed envelope unchanged after retry",
		);
	console.log(
		"Populated upgrade: original values, providers, permissions, admin/preferences, repeat setup, wrong keys, unknown history, migration rollback/retry, interruption/resumption and fresh schema parity PASS.",
	);
} finally {
	for (const db of clients) await db.end();
	for (const name of names)
		await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
	await admin.end();
}
