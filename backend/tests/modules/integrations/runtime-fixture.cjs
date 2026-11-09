const assert = require("node:assert/strict");

const { resolve } = require("node:path");

const { parseWindow } = require(resolve(process.argv[2]));

async function check() {
	const window = {
		start: new Date("2026-10-20"),
		end: new Date("2026-10-30"),
		pastDays: 0,
		futureDays: 10,
	};

	const feed =
		"BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:runtime-test\r\nSUMMARY:Planning\r\nDTSTART:20261024T130000\r\nDTEND:20261024T140000\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR";

	const events = await parseWindow([feed], window, "Europe/Berlin");

	assert.deepEqual(
		events.map((event) => event.startTime.toISOString()),
		[
			"2026-10-24T11:00:00.000Z",
			"2026-10-25T12:00:00.000Z",
			"2026-10-26T12:00:00.000Z",
		],
	);

	assert.equal(
		events.every((event) => event.isRecurring),
		true,
	);

	assert.equal(new Set(events.map((event) => event.externalId)).size, 3);

	assert.deepEqual(
		await parseWindow(
			["BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR"],
			window,
		),
		[],
	);

	await assert.rejects(
		parseWindow([feed], window, "Invalid/Zone"),
		/PROVIDER_INVALID_CALENDAR/,
	);
}

check().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
