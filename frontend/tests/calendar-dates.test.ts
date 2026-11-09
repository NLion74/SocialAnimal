import { describe, it, expect } from "vitest";
import { dayBounds, zonedParts, displaysAsAllDay } from "../lib/calendar-dates";

describe("calendar date boundaries", () => {
	it("uses the displayed timezone instead of the browser timezone", () => {
		const bounds = dayBounds(new Date(2026, 9, 10), "America/Los_Angeles");
		expect(bounds.start.toISOString()).toBe("2026-10-10T07:00:00.000Z");
		expect(bounds.end.toISOString()).toBe("2026-10-11T07:00:00.000Z");
	});

	it("handles a 25-hour day at the end of daylight saving", () => {
		const bounds = dayBounds(new Date(2026, 9, 25), "Europe/Berlin");
		expect(+bounds.end - +bounds.start).toBe(25 * 3600000);
		expect(zonedParts(bounds.start, "Europe/Berlin").hour).toBe(0);
	});

	it("handles a 23-hour day at the start of daylight saving", () => {
		const bounds = dayBounds(new Date(2026, 2, 29), "Europe/Berlin");
		expect(+bounds.end - +bounds.start).toBe(23 * 3600000);
	});
});

describe("Multi-day event presentation", () => {
	const event = (startTime: string, endTime: string) => ({
		startTime,
		endTime,
		allDay: false,
	});

	it("puts overnight and longer timed events in the all-day area", () => {
		expect(
			displaysAsAllDay(
				event("2026-11-02T16:00:00Z", "2026-11-03T08:00:00Z"),
				"Europe/Berlin",
			),
		).toBe(true);
		expect(
			displaysAsAllDay(
				event("2026-11-02T16:00:00Z", "2026-11-06T08:00:00Z"),
				"Europe/Berlin",
			),
		).toBe(true);
	});

	it("uses displayed calendar dates and exclusive end times", () => {
		const overnightUTC = event(
			"2026-11-02T23:30:00Z",
			"2026-11-03T00:30:00Z",
		);
		expect(displaysAsAllDay(overnightUTC, "UTC")).toBe(true);
		expect(displaysAsAllDay(overnightUTC, "Europe/Berlin")).toBe(false);
		expect(
			displaysAsAllDay(
				event("2026-11-02T20:00:00Z", "2026-11-03T00:00:00Z"),
				"UTC",
			),
		).toBe(false);
	});

	it("does not confuse a daylight-saving boundary with multiple dates", () => {
		expect(
			displaysAsAllDay(
				event("2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z"),
				"Europe/Berlin",
			),
		).toBe(false);
		expect(
			displaysAsAllDay(
				event("2026-10-24T21:00:00Z", "2026-10-25T23:00:00Z"),
				"Europe/Berlin",
			),
		).toBe(true);
	});

	it("preserves explicit all-day events and original timed values", () => {
		const timed = event("2026-11-02T16:00:00Z", "2026-11-03T08:00:00Z");
		const original = { ...timed };
		displaysAsAllDay(timed, "UTC");
		expect(timed).toEqual(original);
		expect(displaysAsAllDay({ ...timed, allDay: true }, "UTC")).toBe(true);
	});
});
