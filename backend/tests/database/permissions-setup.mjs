import pg from "pg";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import secrets from "../../dist/core/secrets/index.js";

const url = process.env.TEST_DATABASE_URL;

if (!url || !new URL(url).pathname.endsWith("_test"))
	throw new Error("Disposable *_test database required");

const admin = new pg.Client({ connectionString: url });

await admin.connect();

const name = `permissions_setup_${randomBytes(6).toString("hex")}_test`;

await admin.query(`CREATE DATABASE "${name}"`);

const target = new URL(url);

target.pathname = "/" + name;

const db = new pg.Client({ connectionString: target.toString() });

await db.connect();

const setup = () =>
	execFileSync(process.execPath, ["dist/setup-database.js"], {
		env: { ...process.env, DATABASE_URL: target.toString() },
		stdio: "inherit",
	});

try {
	setup();
	await db.query('DROP TABLE "AuthChallenge"');

	await db.query(
		'ALTER TABLE "User" DROP COLUMN "twoFactorMethod", DROP COLUMN "totpSecret", DROP COLUMN "totpLastStep", DROP COLUMN "recoveryCodes", DROP COLUMN "securitySetupRequired"',
	);

	await db.query('ALTER TABLE "AppSettings" DROP COLUMN "requireTwoFactor"');
	await db.query('ALTER TABLE "Event" DROP COLUMN "isRecurring"');
	await db.query('ALTER TABLE "CalendarShare" DROP COLUMN "expiresAt"');
	await db.query('ALTER TABLE "Subscription" DROP COLUMN "expiresAt"');
	// Recreate the previous application's schema in this disposable database only.
	await db.query('ALTER TABLE "CalendarShare" DROP COLUMN "rulesetId"');

	await db.query(
		'ALTER TABLE "Subscription" DROP COLUMN "rulesetId", DROP COLUMN "name", DROP COLUMN "version"',
	);

	await db.query(
		'ALTER TABLE "InviteCode" DROP COLUMN "label", DROP COLUMN "expiresAt", DROP COLUMN "revokedAt"',
	);

	await db.query(
		'ALTER TABLE "AppSettings" DROP COLUMN "syncPastDays", DROP COLUMN "syncFutureDays", DROP COLUMN "defaultTimezone", DROP COLUMN "defaultFirstDayOfWeek"',
	);

	await db.query(
		'DROP TABLE "PermissionRuleset", "EmailVerification", "PasswordReset", "RecoveryMail", "RecoveryThrottle"',
	);

	await db.query(
		'ALTER TABLE "User" DROP COLUMN "authVersion", DROP COLUMN "passwordChangedAt"',
	);

	await db.query(
		'ALTER TABLE "User" DROP COLUMN "accountRole", DROP COLUMN "disabled", DROP COLUMN "emailVerifiedAt", DROP COLUMN "permissionsInitialized", ADD COLUMN "retainedHistoricalColumn" TEXT',
	);

	await db.query(
		'ALTER TABLE "AppSettings" DROP COLUMN "requireEmailVerification", DROP COLUMN "maxCalendarsPerUser", DROP COLUMN "minSyncIntervalMinutes"',
	);

	await db.query(
		`INSERT INTO "User" (id, email, "passwordHash", salt, "isAdmin", "retainedHistoricalColumn") VALUES ('owner', 'owner@example.test', 'keep-hash', 'keep-salt', true, 'keep-history'), ('friend', 'friend@example.test', 'friend-hash', '', false, NULL)`,
	);

	await db.query(
		`INSERT INTO "AppSettings" (id, "registrationsOpen", "inviteOnly", "updatedAt") VALUES ('global', false, true, NOW())`,
	);

	await db.query(
		`INSERT INTO "UserSettings" (id, "userId", timezone) VALUES ('preferences', 'owner', 'Europe/Berlin')`,
	);

	await db.query(
		`INSERT INTO "Friendship" (id, "user1Id", "user2Id", status, "updatedAt") VALUES ('friends', 'owner', 'friend', 'accepted', NOW())`,
	);

	const encrypted = secrets.encrypt({
		url: "https://example.test/feed",
		password: "keep-credentials",
	});

	await db.query(
		`INSERT INTO "Connection" (id, "userId", type, name, credentials, "updatedAt") VALUES ('connection', 'owner', 'ics', 'Keep connection', $1, NOW())`,
		[encrypted],
	);

	for (const permission of ["full", "titles", "busy"]) {
		await db.query(
			`INSERT INTO "Calendar" (id, "userId", name, type, "syncInterval", "connectionId", "remoteId", "updatedAt") VALUES ($1, 'owner', $1, 'ics', 0, 'connection', $1, NOW())`,
			[permission],
		);

		await db.query(
			`INSERT INTO "CalendarShare" (id, "calendarId", "sharedWithId", permission) VALUES ($1, $1, 'friend', $2::"SharePermission")`,
			[permission, permission],
		);

		await db.query(
			`INSERT INTO "Event" (id, "calendarId", title, "startTime", "endTime", "updatedAt") VALUES ($1, $1, 'Keep event', NOW(), NOW() + INTERVAL '1 hour', NOW())`,
			[permission],
		);
	}

	await db.query(
		`INSERT INTO "InviteCode" (id, code, "createdBy") VALUES ('invite', 'keep-invite', 'owner')`,
	);

	await db.query(
		`INSERT INTO "Subscription" (id, "calendarId", "issuerId", "tokenHash", ceiling) VALUES ('subscription', 'full', 'owner', 'keep-token-hash', 'titles')`,
	);

	const tables = [
		"User",
		"UserSettings",
		"AppSettings",
		"Friendship",
		"Connection",
		"Calendar",
		"CalendarShare",
		"Event",
		"InviteCode",
		"Subscription",
	];

	const before = new Map();

	for (const table of tables)
		before.set(
			table,
			(await db.query(`SELECT * FROM "${table}" ORDER BY id`)).rows,
		);

	setup();

	for (const table of tables) {
		const rows = (await db.query(`SELECT * FROM "${table}" ORDER BY id`))
			.rows;

		const old = before.get(table);
		assert.equal(rows.length, old.length, table);

		rows.forEach((row, i) => {
			for (const [key, value] of Object.entries(old[i]))
				assert.deepEqual(row[key], value, `${table}.${key}`);
		});
	}

	assert.equal(
		(
			await db.query('SELECT "accountRole" FROM "User" WHERE id = $1', [
				"owner",
			])
		).rows[0].accountRole,
		"admin",
	);

	assert.equal(
		(
			await db.query(
				'SELECT COUNT(*)::int AS count FROM "PermissionRuleset"',
			)
		).rows[0].count,
		8,
	);

	assert.equal(
		(
			await db.query(
				'SELECT COUNT(*)::int AS count FROM "CalendarShare" s JOIN "PermissionRuleset" r ON r.id = s."rulesetId" WHERE r.fallback = s.permission::text AND r."userId" = $1',
				["owner"],
			)
		).rows[0].count,
		3,
	);

	await db.query(
		`UPDATE "PermissionRuleset" SET name = 'Edited default', fallback = 'hidden' WHERE "userId" = 'owner' AND "seedKey" = 'full'`,
	);

	setup();

	assert.equal(
		(
			await db.query(
				`SELECT fallback FROM "PermissionRuleset" WHERE "userId" = 'owner' AND "seedKey" = 'full'`,
			)
		).rows[0].fallback,
		"hidden",
	);

	assert.equal(
		(
			await db.query(
				'SELECT COUNT(*)::int AS count FROM "PermissionRuleset"',
			)
		).rows[0].count,
		8,
	);

	assert.equal(
		secrets.decrypt(
			(await db.query('SELECT credentials FROM "Connection"')).rows[0]
				.credentials,
		).password,
		"keep-credentials",
	);

	console.log(
		"Populated setup preserves all previous values, assigns matching defaults, retains historical columns, and preserves edited rulesets on restart.",
	);
} finally {
	await db.end();
	await admin.query(`DROP DATABASE "${name}"`);
	await admin.end();
}
