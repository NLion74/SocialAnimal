import { describe, it, expect } from "vitest";
import { expirationInstant, expirationLocal } from "../lib/expiration";

describe("sharing expiration in the owner's timezone", () => {
	it("uses the owner rather than browser or viewer timezone", () => {
		expect(expirationInstant("2027-01-10T18:00", "America/New_York")).toBe(
			"2027-01-10T23:00:00.000Z",
		);
		expect(expirationLocal("2027-01-10T23:00:00Z", "Asia/Tokyo")).toBe(
			"2027-01-11T08:00",
		);
	});
	it("rejects nonexistent times and chooses the later repeated hour", () => {
		expect(() =>
			expirationInstant("2027-03-28T02:30", "Europe/Berlin"),
		).toThrow("does not exist");
		expect(expirationInstant("2027-10-31T02:30", "Europe/Berlin")).toBe(
			"2027-10-31T01:30:00.000Z",
		);
	});
	it("handles fractional offsets and invalid calendar dates", () => {
		expect(expirationInstant("2027-01-10T18:00", "Asia/Kathmandu")).toBe(
			"2027-01-10T12:15:00.000Z",
		);
		expect(() => expirationInstant("2027-02-30T18:00", "UTC")).toThrow();
	});
});
