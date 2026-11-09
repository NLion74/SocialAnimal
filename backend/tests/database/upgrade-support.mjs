import { spawnSync } from "node:child_process";
import {
	mkdtempSync,
	mkdirSync,
	copyFileSync,
	readdirSync,
	rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
export async function snapshot(db, previous) {
	const columns =
		previous ||
		Object.groupBy(
			(
				await db.query(
					`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name,ordinal_position`,
				)
			).rows,
			(row) => row.table_name,
		);
	const result = {};
	for (const [table, entry] of Object.entries(columns)) {
		const names = Array.isArray(entry)
			? entry.map((r) => r.column_name)
			: entry.columns;
		const rows = (
			await db.query(
				`SELECT row_to_json(original)::text AS value FROM (SELECT ${names.map(quote).join(",")} FROM ${quote(table)}) original ORDER BY row_to_json(original)::text COLLATE "C"`,
			)
		).rows;
		result[table] = {
			columns: names,
			count: rows.length,
			hash: createHash("sha256")
				.update(JSON.stringify(rows))
				.digest("hex"),
		};
	}
	return result;
}
export async function preserved(db, before) {
	const after = await snapshot(db, before);
	for (const table of Object.keys(before))
		assert.ok(
			JSON.stringify(before[table]) === JSON.stringify(after[table]),
			`Original values changed in ${table}`,
		);
}
export async function catalog(db) {
	const queries = [
		`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name<>'_prisma_migrations' ORDER BY 1,2`,
		`SELECT c.relname,n.conname,pg_get_constraintdef(n.oid) definition FROM pg_constraint n JOIN pg_class c ON c.oid=n.conrelid JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND c.relname<>'_prisma_migrations' ORDER BY 1,2`,
		`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY 1,2`,
		`SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid ORDER BY 1,3`,
	];
	const result = [];
	for (const sql of queries) result.push((await db.query(sql)).rows);
	return result;
}
export async function verifyUpgrade(db, decrypt) {
	const rows = (
		await db.query(
			`SELECT c.*, x."userId" AS owner, x.type AS provider, x.credentials FROM "Calendar" c JOIN "Connection" x ON x.id=c."connectionId"`,
		)
	).rows;
	assert.equal(
		rows.length,
		Number(
			(await db.query('SELECT count(*) FROM "Calendar"')).rows[0].count,
		),
	);
	for (const row of rows) {
		const expected = {
			...row.config,
			...(row.config.url ? {} : row.url ? { url: row.url } : {}),
		};
		assert.ok(
			JSON.stringify(decrypt(row.credentials)) ===
				JSON.stringify(expected),
			"Provider credential round trip",
		);
		assert.ok(
			row.owner === row.userId && row.provider === row.type,
			"Connection ownership/type",
		);
		const remote =
			row.type === "ics"
				? "feed"
				: row.config.calendarId ||
					row.config.calendarPath ||
					row.config.url ||
					row.url ||
					row.id;
		assert.ok(row.remoteId === remote, "Provider remote calendar identity");
	}
	assert.equal(
		(
			await db.query(
				`SELECT 1 FROM "User" WHERE "isAdmin" AND "accountRole" <> 'admin'`,
			)
		).rowCount,
		0,
	);
	assert.equal(
		(
			await db.query(
				`SELECT 1 FROM "CalendarShare" s JOIN "Calendar" c ON c.id=s."calendarId" LEFT JOIN "PermissionRuleset" r ON r.id=s."rulesetId" WHERE r.id IS NULL OR r."userId"<>c."userId" OR r.fallback<>s.permission::text OR r.rules<>'[]'::jsonb`,
			)
		).rowCount,
		0,
	);
	assert.equal(
		(
			await db.query(
				'SELECT 1 FROM "User" WHERE NOT "permissionsInitialized"',
			)
		).rowCount,
		0,
	);
}

export function deployProductionBaseline(url) {
	if (!new URL(url).pathname.endsWith("_test"))
		throw new Error("Disposable *_test database required");
	const work = mkdtempSync(process.cwd() + "/node_modules/.upgrade-");
	try {
		const historical = readdirSync("prisma/migrations")
			.filter(
				(name) =>
					/^\d{14}_/.test(name) &&
					name <= "20260305102000_add_default_tab_to_user_settings",
			)
			.sort();
		assert.equal(historical.length, 14, "Production migration count");
		mkdirSync(work + "/prisma/migrations", { recursive: true });
		for (const file of [
			"prisma.config.ts",
			"prisma/schema.prisma",
			"prisma/migrations/migration_lock.toml",
		])
			copyFileSync(file, work + "/" + file);
		for (const name of historical) {
			mkdirSync(work + "/prisma/migrations/" + name);
			copyFileSync(
				"prisma/migrations/" + name + "/migration.sql",
				work + "/prisma/migrations/" + name + "/migration.sql",
			);
		}
		const result = spawnSync(
			process.execPath,
			[
				"node_modules/prisma/build/index.js",
				"migrate",
				"deploy",
				"--config",
				work + "/prisma.config.ts",
			],
			{ env: { ...process.env, DATABASE_URL: url }, encoding: "utf8" },
		);
		assert.equal(result.status, 0, "Historical migration replay failed");
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}
