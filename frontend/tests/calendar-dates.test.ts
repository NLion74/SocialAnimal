import { describe, it, expect } from "vitest";
import { dayBounds, zonedParts } from "../lib/calendar-dates";

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
