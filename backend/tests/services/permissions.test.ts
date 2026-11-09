import { describe, it, expect } from "vitest";
import {
	compileRuleset,
	validateRuleset,
	timegrid,
	stricter,
	limits,
	type Condition,
	type Visibility,
} from "../../src/services/permissions";

const document = (when: Condition, visibility: Visibility = "busy") => ({
	fallback: "full",
	rules: [{ when, visibility }],
});

describe("Permission engine", () => {
	it("uses first match from priority zero, then the mutable fallback", () => {
		const rule = {
			when: {
				attribute: "calendar.name",
				operator: "contains",
				value: "Work",
			},
			visibility: "titles",
		};

		const input = {
			fallback: "hidden",
			rules: [rule, { ...rule, visibility: "full" }],
		};

		expect(compileRuleset(input)({ "calendar.name": "Work" })).toBe(
			"titles",
		);

		expect(compileRuleset(input)({ "calendar.name": "Personal" })).toBe(
			"hidden",
		);

		input.rules[0].visibility = "busy";
		expect(compileRuleset(input)({ "calendar.name": "Work" })).toBe("busy");
	});

	it("composes AND, OR and NOT with typed attributes", () => {
		const when: Condition = {
			all: [
				{
					attribute: "timegrid.day",
					operator: "equals",
					value: "monday",
				},
				{
					attribute: "timegrid.time",
					operator: "between",
					value: ["13:00", "14:00"],
				},
				{
					not: {
						any: [
							{
								attribute: "event.title",
								operator: "startsWith",
								value: "Public",
							},
							{
								attribute: "event.duration",
								operator: "lessThan",
								value: 10,
							},
						],
					},
				},
			],
		};

		const evaluate = compileRuleset(document(when));

		const context = {
			...timegrid(new Date("2026-10-05T11:30:00Z"), "Europe/Berlin"),
			"event.title": "Private",
			"event.duration": 60,
		};

		expect(evaluate(context)).toBe("busy");

		expect(evaluate({ ...context, "event.title": "Public meeting" })).toBe(
			"full",
		);

		expect(evaluate({ ...context, "timegrid.day": "tuesday" })).toBe(
			"full",
		);
	});

	it.each([
		["calendar.name", "equals", "Work", "Work"],
		["calendar.name", "contains", "or", "Work"],
		["calendar.name", "startsWith", "Wo", "Work"],
		["calendar.name", "endsWith", "rk", "Work"],
		["calendar.name", "regex", "^W[a-z]+$", "Work"],
		["event.duration", "greaterThan", 5, 6],
		["event.duration", "greaterOrEqual", 5, 5],
		["event.duration", "lessThan", 5, 4],
		["event.duration", "lessOrEqual", 5, 5],
		["event.duration", "between", [5, 10], 10],
		["timegrid.date", "before", "2026-02-01", "2026-01-01"],
		["timegrid.date", "after", "2026-01-01", "2026-02-01"],
		[
			"timegrid.date",
			"between",
			["2026-01-01", "2026-02-01"],
			"2026-01-01",
		],
	])("evaluates %s %s", (attribute, operator, value, actual) => {
		expect(
			compileRuleset(
				document({ attribute, operator, value } as Condition),
			)({ [attribute]: actual as string | number }),
		).toBe("busy");
	});

	it("handles midnight and daylight saving changes in the owner's timezone", () => {
		expect(
			timegrid(new Date("2026-10-25T00:30:00Z"), "Europe/Berlin")[
				"timegrid.time"
			],
		).toBe("02:30");

		expect(
			timegrid(new Date("2026-10-25T01:30:00Z"), "Europe/Berlin")[
				"timegrid.time"
			],
		).toBe("02:30");

		expect(
			timegrid(new Date("2026-10-04T22:00:00Z"), "Europe/Berlin"),
		).toEqual({
			"timegrid.date": "2026-10-05",
			"timegrid.time": "00:00",
			"timegrid.day": "monday",
		});
	});

	it("rejects unknown attributes, incompatible types, invalid dates and unsafe regex features", () => {
		for (const when of [
			{
				attribute: "user.passwordHash",
				operator: "equals",
				value: "secret",
			},
			{ attribute: "event.duration", operator: "contains", value: 5 },
			{ attribute: "event.duration", operator: "equals", value: "5" },
			{
				attribute: "timegrid.date",
				operator: "equals",
				value: "2026-02-30",
			},
			{
				attribute: "timegrid.time",
				operator: "between",
				value: ["22:00", "02:00"],
			},
			{
				attribute: "calendar.name",
				operator: "regex",
				value: "(?=secret)",
			},
			{
				attribute: "calendar.name",
				operator: "regex",
				value: "x".repeat(129),
			},
		])
			expect(() =>
				validateRuleset(document(when as Condition)),
			).toThrow();
	});

	it("bounds nesting, conditions, rules, and cache entries without changing decisions", () => {
		let when: Condition = {
			attribute: "calendar.name",
			operator: "equals",
			value: "x",
		};

		for (let i = 0; i < limits.depth; i++) when = { not: when };
		expect(() => validateRuleset(document(when))).toThrow();

		expect(() =>
			validateRuleset({
				fallback: "hidden",
				rules: Array(33).fill(
					document({
						attribute: "calendar.name",
						operator: "equals",
						value: "x",
					}).rules[0],
				),
			}),
		).toThrow();

		for (let i = 0; i < 300; i++)
			expect(
				compileRuleset(
					document({
						attribute: "event.duration",
						operator: "equals",
						value: i,
					}),
				)({ "event.duration": i }),
			).toBe("busy");

		expect(stricter("hidden", "full")).toBe("hidden");
		expect(stricter("full", "titles")).toBe("titles");
	});

	it("runs adversarial regex in linear time", () => {
		const evaluate = compileRuleset(
			document({
				attribute: "event.title",
				operator: "regex",
				value: "^(a+)+$",
			}),
		);

		expect(evaluate({ "event.title": "a".repeat(100000) + "!" })).toBe(
			"full",
		);
	});
});

describe("Event overlap semantics", () => {
	const ruleset = compileRuleset({
		fallback: "full",
		rules: [
			{
				visibility: "busy",
				when: {
					all: [
						{
							attribute: "timegrid.day",
							operator: "equals",
							value: "monday",
						},
						{
							attribute: "timegrid.time",
							operator: "between",
							value: ["13:00", "14:00"],
						},
					],
				},
			},
		],
	});

	it("includes an event starting before a window and excludes events ending at its start", () => {
		expect(
			ruleset.during(
				{},
				new Date("2026-10-05T10:30Z"),
				new Date("2026-10-05T11:30Z"),
				"Europe/Berlin",
			),
		).toBe("busy");

		expect(
			ruleset.during(
				{},
				new Date("2026-10-05T10:30Z"),
				new Date("2026-10-05T11:00Z"),
				"Europe/Berlin",
			),
		).toBe("full");
	});

	it("combines temporal predicates at the same instant, including across midnight", () => {
		expect(
			ruleset.during(
				{},
				new Date("2026-10-04T11:30Z"),
				new Date("2026-10-04T23:00Z"),
				"Europe/Berlin",
			),
		).toBe("full");

		expect(
			ruleset.during(
				{},
				new Date("2026-10-04T23:00Z"),
				new Date("2026-10-05T12:00Z"),
				"Europe/Berlin",
			),
		).toBe("busy");
	});

	it("includes the second repeated hour and does not invent a missing spring hour", () => {
		const repeated = compileRuleset(
			document({
				attribute: "timegrid.time",
				operator: "between",
				value: ["02:15", "02:30"],
			}),
		);

		expect(
			repeated.during(
				{},
				new Date("2026-10-25T00:45Z"),
				new Date("2026-10-25T01:20Z"),
				"Europe/Berlin",
			),
		).toBe("busy");

		expect(
			repeated.during(
				{},
				new Date("2026-03-29T00:45Z"),
				new Date("2026-03-29T01:20Z"),
				"Europe/Berlin",
			),
		).toBe("full");

		const afterJump = compileRuleset(
			document({
				attribute: "timegrid.time",
				operator: "after",
				value: "02:30",
			}),
		);

		expect(
			afterJump.during(
				{},
				new Date("2026-03-29T00:45Z"),
				new Date("2026-03-29T01:05Z"),
				"Europe/Berlin",
			),
		).toBe("busy");
	});

	it("keeps rule priority over different matching portions of an event", () => {
		const compiled = compileRuleset({
			fallback: "full",
			rules: [
				{
					when: {
						attribute: "timegrid.time",
						operator: "after",
						value: "15:00",
					},
					visibility: "hidden",
				},
				{
					when: {
						attribute: "timegrid.time",
						operator: "before",
						value: "14:00",
					},
					visibility: "titles",
				},
			],
		});

		expect(
			compiled.during(
				{},
				new Date("2026-10-01T12:00Z"),
				new Date("2026-10-01T16:00Z"),
				"UTC",
			),
		).toBe("hidden");
	});
});

describe("Unknown attribute logic", () => {
	const missing: Condition = {
		attribute: "friend.email",
		operator: "contains",
		value: "example.test",
	};

	const known: Condition = {
		attribute: "calendar.name",
		operator: "equals",
		value: "Work",
	};

	const evaluate = (when: Condition) =>
		compileRuleset({
			fallback: "hidden",
			rules: [{ when, visibility: "full" }],
		})({ "calendar.name": "Work" });

	it("keeps unknown unknown under NOT and double NOT", () => {
		expect(evaluate({ not: missing })).toBe("hidden");
		expect(evaluate({ not: { not: missing } })).toBe("hidden");
	});

	it("uses definite AND/OR outcomes without turning unknown into false", () => {
		expect(evaluate({ all: [known, missing] })).toBe("hidden");
		expect(evaluate({ any: [known, missing] })).toBe("full");

		expect(evaluate({ not: { any: [{ not: known }, missing] } })).toBe(
			"hidden",
		);

		expect(evaluate({ not: { all: [{ not: known }, missing] } })).toBe(
			"full",
		);
	});
});
