import { describe, it, expect } from "vitest";
import { dailyWindows, suggestedTimes } from "../../src/services/availability";
import { compileRuleset, stricter } from "../../src/services/permissions";

const interval = (start: string, end: string) => ({
	start: new Date(start),
	end: new Date(end),
});

describe("Find a time", () => {
	it("uses local hours across daylight saving transitions", () => {
		const windows = dailyWindows(
			"2027-03-27",
			"2027-03-28",
			"09:00",
			"12:00",
			"Europe/Berlin",
		);
		expect(windows.map((window) => window.start.toISOString())).toEqual([
			"2027-03-27T08:00:00.000Z",
			"2027-03-28T07:00:00.000Z",
		]);
	});

	it("merges overlapping and touching intervals and clips cross-day events", () => {
		const windows = dailyWindows(
			"2027-01-01",
			"2027-01-01",
			"09:00",
			"17:00",
			"UTC",
		);
		const busy = [
			interval("2026-12-31T23:00Z", "2027-01-01T10:00Z"),
			interval("2027-01-01T09:30Z", "2027-01-01T11:00Z"),
			interval("2027-01-01T11:00Z", "2027-01-01T12:00Z"),
			interval("2027-01-01T14:00Z", "2027-01-02T03:00Z"),
		];
		expect(suggestedTimes(windows, busy, 60, new Date(0))).toEqual([
			interval("2027-01-01T12:00Z", "2027-01-01T14:00Z"),
		]);
		expect(suggestedTimes(windows, busy, 180, new Date(0))).toEqual([]);
	});

	it("returns no slots during an all-day event and excludes the past", () => {
		const windows = dailyWindows(
			"2027-01-01",
			"2027-01-01",
			"09:00",
			"17:00",
			"UTC",
		);
		expect(
			suggestedTimes(
				windows,
				[interval("2027-01-01T00:00Z", "2027-01-02T00:00Z")],
				30,
				new Date(0),
			),
		).toEqual([]);
		expect(
			suggestedTimes(windows, [], 60, new Date("2027-01-01T16:30Z")),
		).toEqual([]);
	});

	it("bounds date ranges and daily hours", () => {
		expect(() =>
			dailyWindows("2027-01-01", "2027-02-01", "09:00", "17:00", "UTC"),
		).toThrow();
		expect(() =>
			dailyWindows("2027-01-01", "2027-01-02", "21:00", "09:00", "UTC"),
		).toThrow();
	});
});

describe("Highlight visibility", () => {
	it("uses first match with both event and recipient attributes", () => {
		const engine = compileRuleset({
			fallback: "hidden",
			rules: [
				{
					when: {
						all: [
							{
								attribute: "event.title",
								operator: "contains",
								value: "Paul",
							},
							{
								attribute: "friend.email",
								operator: "equals",
								value: "paul@gmail.com",
							},
						],
					},
					visibility: "highlight",
				},
			],
		});
		expect(
			engine({
				"event.title": "Meet Paul",
				"friend.email": "paul@gmail.com",
			}),
		).toBe("highlight");
		expect(
			engine({
				"event.title": "Meet Paul",
				"friend.email": "someone@example.test",
			}),
		).toBe("hidden");
	});

	it("keeps full details at a full ceiling but obeys stricter ceilings", () => {
		expect(stricter("highlight", "full")).toBe("highlight");
		expect(stricter("full", "highlight")).toBe("highlight");
		expect(stricter("highlight", "titles")).toBe("titles");
		expect(stricter("highlight", "busy")).toBe("busy");
		expect(stricter("highlight", "hidden")).toBe("hidden");
	});
});
