import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const url = process.env.TEST_DATABASE_URL;

if (!url || !new URL(url).pathname.endsWith("_test"))
	throw new Error("Disposable *_test database required");

const db = new pg.Client({ connectionString: url });

await db.connect();

await db.query(`INSERT INTO "User" (id,email,"passwordHash",salt,name,"isAdmin") VALUES ('baseline-owner','owner@example.test','hash-preserved','salt-preserved','Owner',true), ('baseline-friend','friend@example.test','hash-friend','salt-friend','Friend',false);
INSERT INTO "Calendar" (id,"userId",name,type,config,"syncInterval","updatedAt") VALUES ('baseline-calendar','baseline-owner','Existing','ics','{"url":"https://example.test/private.ics","password":"secret-preserved"}',0,NOW());
INSERT INTO "Event" (id,"calendarId","externalId",title,"startTime","endTime","updatedAt") VALUES ('baseline-event','baseline-calendar','remote-event','Private title','2026-09-01','2026-10-01',NOW());
INSERT INTO "CalendarShare" (id,"calendarId","sharedWithId",permission) VALUES ('baseline-share','baseline-calendar','baseline-friend','titles');
INSERT INTO "Friendship" (id,"user1Id","user2Id",status,"updatedAt") VALUES ('baseline-friendship','baseline-owner','baseline-friend','accepted',NOW());
INSERT INTO "InviteCode" (id,code,"createdBy") VALUES ('baseline-invite','unused-code','baseline-owner');
INSERT INTO "UserSettings" (id,"userId",timezone,"defaultSharePermission") VALUES ('baseline-settings','baseline-owner','Europe/Berlin','busy');
INSERT INTO "AppSettings" (id,"registrationsOpen","inviteOnly","updatedAt") VALUES ('global',true,false,NOW());`);

const tables = [
	"User",
	"Calendar",
	"Event",
	"CalendarShare",
	"Friendship",
	"InviteCode",
	"UserSettings",
	"AppSettings",
];

const before = {};

for (const table of tables)
	before[table] = (
		await db.query(`SELECT * FROM "${table}" ORDER BY id`)
	).rows;

await db.query(
	await readFile(
		"prisma/migrations/20260929120000_rest_v1/migration.sql",
		"utf8",
	),
);

for (const table of tables) {
	const after = (
		await db.query(`SELECT * FROM "${table}" ORDER BY id`)
	).rows.map((row) =>
		Object.fromEntries(
			Object.keys(before[table][0]).map((k) => [k, row[k]]),
		),
	);

	assert.deepEqual(
		after,
		before[table],
		`${table} data changed during additive migration`,
	);
}

const baseline = JSON.parse(
	await readFile("tests/database/baseline-columns.json", "utf8"),
);

for (const column of baseline) {
	const found = (
		await db.query(
			`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
			[column.table_name, column.column_name],
		)
	).rows;

	assert.equal(
		found.length,
		1,
		`Lost column ${column.table_name}.${column.column_name}`,
	);
}

console.log(
	"Populated upgrade preserves all historical columns, IDs, credentials, grants, friendships, invitations and settings",
);

await db.end();
