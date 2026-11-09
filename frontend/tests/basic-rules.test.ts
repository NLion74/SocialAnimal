import { describe, expect, it } from "vitest";
import {
	basicError,
	decodeBasic,
	encodeBasic,
	type BasicFilters,
} from "../features/permissions/basic-rules";
import type { Condition } from "../features/permissions/api";

describe("Basic visibility filters", () => {
	it("roundtrips all filters without losing selected weekdays or text case", () => {
		const filters: BasicFilters = {
			days: ["monday", "friday"],
			time: ["13:00", "14:00"],
			date: ["2026-11-01", "2026-11-30"],
			title: { operator: "equals", value: "Planning" },
			description: { operator: "contains", value: "Private" },
		};
		expect(decodeBasic(encodeBasic(filters))).toEqual(filters);
		expect(encodeBasic(filters)).toMatchObject({
			all: expect.arrayContaining([
				{
					any: [
						{
							attribute: "timegrid.day",
							operator: "equals",
							value: "monday",
						},
						{
							attribute: "timegrid.day",
							operator: "equals",
							value: "friday",
						},
					],
				},
			]),
		});
	});

	it.each<Condition>([
		{ attribute: "event.title", operator: "regex", value: ".*" },
		{ attribute: "calendar.name", operator: "equals", value: "Work" },
		{
			not: {
				attribute: "event.title",
				operator: "contains",
				value: "Private",
			},
		},
		{
			all: [
				{ attribute: "event.title", operator: "contains", value: "A" },
				{ attribute: "event.title", operator: "equals", value: "B" },
			],
		},
		{
			any: [
				{ attribute: "event.title", operator: "contains", value: "A" },
				{
					attribute: "timegrid.day",
					operator: "equals",
					value: "monday",
				},
			],
		},
		{ attribute: "timegrid.time", operator: "after", value: "13:00" },
	])("leaves unsupported conditions in Expert unchanged: %j", (condition) => {
		const original = JSON.stringify(condition);
		expect(decodeBasic(condition)).toBeNull();
		expect(JSON.stringify(condition)).toBe(original);
	});

	it("rejects empty and incomplete filters and reversed ranges", () => {
		for (const value of [
			{},
			{ days: [] },
			{ time: ["", "14:00"] },
			{ time: ["14:00", "13:00"] },
			{ date: ["2026-12-01", "2026-11-01"] },
			{ title: { operator: "equals", value: "" } },
		] as BasicFilters[])
			expect(basicError(value)).toBeTruthy();
		expect(basicError({ time: ["13:00", "13:00"] })).toBeNull();
	});
});
