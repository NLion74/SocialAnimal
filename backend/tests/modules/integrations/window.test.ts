import { describe, it, expect } from "vitest";
import {
	parseWindow,
	type SyncWindow,
} from "../../../src/modules/integrations/adapters/window";

const window: SyncWindow = {
	start: new Date("2026-10-20T00:00:00Z"),
	end: new Date("2026-10-30T00:00:00Z"),
	pastDays: 0,
	futureDays: 10,
};

const feed = (events: string) =>
	`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR`;

const event = (properties: string) =>
	`BEGIN:VEVENT\r\nUID:recurring\r\nSUMMARY:Planning\r\n${properties}\r\nEND:VEVENT`;

describe("bounded recurrence normalization", () => {
	it("expands floating recurrences in the owner's timezone across DST", async () => {
		const rows = await parseWindow(
			[
				feed(
					event(
						"DTSTART:20261024T130000\r\nDTEND:20261024T140000\r\nRRULE:FREQ=DAILY;COUNT=3",
					),
				),
			],
			window,
			"Europe/Berlin",
		);

		expect(rows.map((row) => row.startTime.toISOString())).toEqual([
			"2026-10-24T11:00:00.000Z",
			"2026-10-25T12:00:00.000Z",
			"2026-10-26T12:00:00.000Z",
		]);

		expect(new Set(rows.map((row) => row.externalId)).size).toBe(3);
	});

	it("applies exclusion dates and cancelled overrides", async () => {
		const source = feed(
			event(
				"DTSTART:20261024T130000Z\r\nDTEND:20261024T140000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20261025T130000Z",
			) +
				"\r\n" +
				event(
					"RECURRENCE-ID:20261026T130000Z\r\nDTSTART:20261026T130000Z\r\nDTEND:20261026T140000Z\r\nSTATUS:CANCELLED",
				),
		);

		const rows = await parseWindow([source], window);
		expect(rows).toHaveLength(1);
		expect(rows[0].externalId).toBe("recurring");
	});

	it("retains overlapping all-day events and excludes the interval end", async () => {
		const rows = await parseWindow(
			[
				feed(
					event(
						"DTSTART;VALUE=DATE:20261019\r\nDTEND;VALUE=DATE:20261022",
					),
				),
				feed(
					event("DTSTART:20261030T000000Z\r\nDTEND:20261030T010000Z"),
				),
			],
			window,
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].allDay).toBe(true);
	});

	it("preserves occurrence identity when an exception moves", async () => {
		const master = event(
			"DTSTART:20261024T130000Z\r\nDTEND:20261024T140000Z\r\nRRULE:FREQ=DAILY;COUNT=3",
		);

		const override = event(
			"RECURRENCE-ID:20261025T130000Z\r\nDTSTART:20261025T160000Z\r\nDTEND:20261025T170000Z",
		);

		const rows = await parseWindow(
			[feed(master + "\r\n" + override)],
			window,
		);

		const moved = rows.find(
			(row) => row.startTime.toISOString() === "2026-10-25T16:00:00.000Z",
		);

		expect(moved?.externalId).toBe("recurring::2026-10-25T13:00:00.000Z");
	});

	it("rejects oversized recurrence expansions instead of committing partial results", async () => {
		await expect(
			parseWindow(
				[
					feed(
						event(
							"DTSTART:20261020T000000Z\r\nDTEND:20261020T000001Z\r\nRRULE:FREQ=SECONDLY;COUNT=50001",
						),
					),
				],
				window,
			),
		).rejects.toThrow();
	});
});
