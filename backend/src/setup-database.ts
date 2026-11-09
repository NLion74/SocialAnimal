import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { decrypt, encryptionKey } from "./core/secrets";

let phase = "configuration";
class SetupError extends Error {}
const report = (next: string) => {
	phase = next;
	console.log(
		JSON.stringify({ service: "database-setup", phase, status: "started" }),
	);
};

async function main() {
	report("configuration");
	try {
		encryptionKey();
	} catch {
		throw new SetupError(
			"CREDENTIAL_ENCRYPTION_KEY must contain exactly 64 hexadecimal characters; restore the original key for existing encrypted data.",
		);
	}
	if (!process.env.JWT_SECRET)
		throw new SetupError("JWT_SECRET is required.");
	try {
		const url = new URL(process.env.DATABASE_URL || "");
		if (!["postgres:", "postgresql:"].includes(url.protocol))
			throw new Error();
		if (
			url.searchParams.has("schema") &&
			url.searchParams.get("schema") !== "public"
		)
			throw new Error();
	} catch {
		throw new SetupError(
			"DATABASE_URL must identify a PostgreSQL database using the public schema.",
		);
	}

	const db = new Client({ connectionString: process.env.DATABASE_URL });
	await db.connect();
	try {
		// Hold this session lock across migration and all restartable data phases.
		await db.query("SELECT pg_advisory_lock(742903)");
		const tables = (
			await db.query(
				"SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
			)
		).rows.map((row) => row.tablename);
		const directory = resolve(__dirname, "../prisma/migrations");
		const names = readdirSync(directory)
			.filter((name) => /^\d{14}_/.test(name))
			.sort();
		if (tables.length && !tables.includes("_prisma_migrations"))
			throw new SetupError(
				"Populated database has no recognized migration history. Restore a supported backup; setup will not baseline or schema-push it.",
			);
		if (tables.includes("_prisma_migrations")) {
			const history = (
				await db.query(
					"SELECT migration_name, checksum, finished_at, rolled_back_at FROM \"_prisma_migrations\" ORDER BY started_at",
				)
			).rows;
			const completed = history.filter(
				(row) => row.finished_at && !row.rolled_back_at,
			);
			for (const row of history.filter((row) => !row.rolled_back_at)) {
				if (
					!names.includes(row.migration_name) ||
					createHash("sha256")
						.update(
							readFileSync(
								resolve(
									directory,
									row.migration_name,
									"migration.sql",
								),
							),
						)
						.digest("hex") !== row.checksum
				)
					throw new SetupError(
						"Migration history or checksum is unrecognized. Restore the matching release and backup before retrying.",
					);
			}
			if (
				completed.some(
					(row, index) => row.migration_name !== names[index],
				) ||
				(tables.length > 1 && completed.length < 14)
			)
				throw new SetupError(
					"Populated database does not have the complete production migration baseline.",
				);
		}

		// Authenticate every existing envelope before any writes, including a resumed backfill.
		for (const [table, column] of [
			["Connection", "credentials"],
			["User", "totpSecret"],
			["RecoveryMail", "payload"],
			["AuthChallenge", "secret"],
		]) {
			const exists = await db.query(
				"SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2",
				[table, column],
			);
			if (!exists.rowCount) continue;
			// A server cursor bounds memory without exposing records in diagnostics.
			await db.query("BEGIN READ ONLY");
			try {
				await db.query(
					`DECLARE envelopes NO SCROLL CURSOR FOR SELECT "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL AND "${column}" <> ''`,
				);
				for (;;) {
					const rows = (await db.query("FETCH 100 FROM envelopes"))
						.rows;
					if (!rows.length) break;
					for (const row of rows) {
						try {
							decrypt(row.value);
						} catch {
							throw new SetupError(
								"Existing encrypted data cannot be decrypted. Restore the original encryption key; no setup writes were made.",
							);
						}
					}
				}
			} finally {
				await db.query("ROLLBACK");
			}
		}

		report("migrate-deploy");
		const result = spawnSync(
			process.execPath,
			[
				resolve(__dirname, "../node_modules/prisma/build/index.js"),
				"migrate",
				"deploy",
			],
			{ cwd: resolve(__dirname, ".."), encoding: "utf8" },
		);
		if (result.status !== 0) {
			const code = (result.stderr + result.stdout).match(
				/\bP\d{4}\b/,
			)?.[0];
			throw new SetupError(
				`Prisma migrate deploy failed${code ? ` (${code})` : ""}. Inspect migration history privately, fix the cause, and resolve a rolled-back failed migration before retrying.`,
			);
		}

		const { prisma } = await import("./core/database/index.js");
		try {
			const { backfillConnections, validateConnections } =
				await import("./modules/integrations/backfill.js");
			const { initializePermissions } =
				await import("./modules/sharing/rulesets.js");
			report("connection-backfill");
			const processed = await backfillConnections();
			console.log(
				JSON.stringify({
					service: "database-setup",
					phase,
					status: "completed",
					processed,
				}),
			);
			report("permission-initialization");
			await initializePermissions();
			report("integrity-validation");
			await validateConnections();
			const invalid = await db.query(
				"SELECT 1 FROM \"CalendarShare\" s JOIN \"Calendar\" c ON c.id=s.\"calendarId\" LEFT JOIN \"PermissionRuleset\" r ON r.id=s.\"rulesetId\" WHERE r.id IS NULL OR r.\"userId\" <> c.\"userId\" LIMIT 1",
			);
			if (
				invalid.rowCount ||
				(await prisma.user.count({
					where: { permissionsInitialized: false },
				}))
			)
				throw new SetupError(
					"Permission initialization is incomplete or ownership is invalid.",
				);
			const queue = await db.query(
				"SELECT to_regclass('public.\"SyncRun_one_active_calendar\"') AS idx, EXISTS (SELECT 1 FROM pg_constraint WHERE conname='SyncRun_status_check' AND conrelid='\"SyncRun\"'::regclass AND convalidated) AS valid",
			);
			if (!queue.rows[0].idx || !queue.rows[0].valid)
				throw new SetupError("Required queue constraints are missing.");
			console.log(
				JSON.stringify({
					service: "database-setup",
					phase: "ready",
					status: "completed",
				}),
			);
		} finally {
			await prisma.$disconnect();
		}
	} finally {
		await db.end();
	}
}

main().catch((error: unknown) => {
	const code =
		error &&
		typeof error === "object" &&
		"code" in error &&
		typeof error.code === "string" &&
		/^(P\d{4}|[0-9A-Z]{5}|ECONNREFUSED|ENOTFOUND)$/.test(error.code)
			? error.code
			: undefined;
	console.error(
		JSON.stringify({
			service: "database-setup",
			phase,
			status: "failed",
			code,
			message:
				error instanceof SetupError
					? error.message
					: "Setup failed; check database connectivity and integrity. Completed backfill transactions are retained; retry with the same encryption key after fixing the cause.",
		}),
	);
	process.exitCode = 1;
});
