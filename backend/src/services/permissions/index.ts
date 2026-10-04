import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { RE2JS } from "re2js";

export const visibilities = ["hidden", "busy", "titles", "full"] as const;

export type Visibility = (typeof visibilities)[number];

export type AttributeType = "string" | "number" | "date" | "time" | "day";

export type Value = string | number | [string, string] | [number, number];

export type Condition =
	| { attribute: string; operator: string; value: Value }
	| { all: Condition[] }
	| { any: Condition[] }
	| { not: Condition };

export interface Rule {
	when: Condition;
	visibility: Visibility;
}

export interface Ruleset {
	fallback: Visibility;
	rules: Rule[];
}

export const limits = Object.freeze({
	rulesets: 32,
	rules: 32,
	depth: 5,
	nodes: 128,
	children: 16,
	text: 256,
	regex: 128,
	cache: 256,
	intervalDays: 366,
	evaluationPoints: 8192,
});

export const operators: Record<AttributeType, string[]> = {
	string: ["equals", "contains", "startsWith", "endsWith", "regex"],
	number: [
		"equals",
		"greaterThan",
		"greaterOrEqual",
		"lessThan",
		"lessOrEqual",
		"between",
	],
	date: ["equals", "before", "after", "between"],
	time: ["equals", "before", "after", "between"],
	day: ["equals"],
};

export const weekdays = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
];

export const attributes: Array<{
	id: string;
	label: string;
	type: AttributeType;
	source: string;
	choices?: string[];
}> = [
	{
		id: "event.description",
		label: "Event description",
		type: "string",
		source: "event",
	},
	...[
		["event.hasLocation", "Has location"],
		["event.hasDescription", "Has description"],
		["event.isRecurring", "Is recurring"],
	].map(([id, label]) => ({
		id,
		label,
		type: "string" as const,
		source: "event",
		choices: ["yes", "no"],
	})),
	{
		id: "calendar.name",
		label: "Calendar name",
		type: "string",
		source: "calendar",
	},
	{
		id: "calendar.type",
		label: "Calendar provider",
		type: "string",
		source: "calendar",
	},
	{
		id: "calendar.id",
		label: "Calendar ID",
		type: "string",
		source: "calendar",
	},
	{
		id: "friend.name",
		label: "Friend name",
		type: "string",
		source: "friend",
	},
	{
		id: "friend.email",
		label: "Friend email",
		type: "string",
		source: "friend",
	},
	{ id: "friend.id", label: "Friend ID", type: "string", source: "friend" },
	{
		id: "friend.since",
		label: "Friends since",
		type: "date",
		source: "friendship",
	},
	{
		id: "event.title",
		label: "Event title",
		type: "string",
		source: "event",
	},
	{
		id: "event.location",
		label: "Event location",
		type: "string",
		source: "event",
	},
	{
		id: "event.duration",
		label: "Duration in minutes",
		type: "number",
		source: "event",
	},
	{
		id: "event.allDay",
		label: "All-day event",
		type: "string",
		source: "event",
		choices: ["yes", "no"],
	},
	{
		id: "timegrid.date",
		label: "Date",
		type: "date",
		source: "overlap in owner's timezone",
	},
	{
		id: "timegrid.time",
		label: "Time of day",
		type: "time",
		source: "overlap in owner's timezone",
	},
	{
		id: "timegrid.day",
		label: "Day of week",
		type: "day",
		source: "overlap in owner's timezone",
		choices: weekdays,
	},
];

export class RulesetError extends Error {}

const invalid = (message: string): never => {
	throw new RulesetError(message);
};

const record = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === "object" && !Array.isArray(v);

const exactKeys = (v: Record<string, unknown>, keys: string[]) =>
	Object.keys(v).length === keys.length &&
	keys.every((key) => Object.hasOwn(v, key));

const visibility = (v: unknown): v is Visibility =>
	visibilities.includes(v as Visibility);

function validValue(type: AttributeType, value: unknown): boolean {
	if (type === "number")
		return (
			typeof value === "number" &&
			Number.isFinite(value) &&
			Math.abs(value) <= 1e12
		);

	if (typeof value !== "string" || value.length > limits.text) return false;
	if (type === "day") return weekdays.includes(value);
	if (type === "time") return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

	if (type === "date")
		return (
			/^\d{4}-\d{2}-\d{2}$/.test(value) &&
			!Number.isNaN(Date.parse(value)) &&
			new Date(value).toISOString().slice(0, 10) === value
		);

	return true;
}

export function validateRuleset(input: unknown): Ruleset {
	if (
		!record(input) ||
		!exactKeys(input, ["fallback", "rules"]) ||
		!visibility(input.fallback) ||
		!Array.isArray(input.rules) ||
		input.rules.length > limits.rules
	)
		return invalid(
			`A ruleset needs a fallback and at most ${limits.rules} rules`,
		);

	let nodes = 0;

	function visit(node: unknown, depth: number): void {
		if (++nodes > limits.nodes || depth > limits.depth)
			invalid("Rules exceed the condition count or nesting limit");

		if (!record(node)) return invalid("Invalid condition");

		for (const group of ["all", "any"] as const) {
			if (exactKeys(node, [group])) {
				const children = node[group];

				if (
					!Array.isArray(children) ||
					!children.length ||
					children.length > limits.children
				)
					return invalid("Groups need 1–16 conditions");

				children.forEach((child) => visit(child, depth + 1));
				return;
			}
		}

		if (exactKeys(node, ["not"])) return visit(node.not, depth + 1);

		if (!exactKeys(node, ["attribute", "operator", "value"]))
			return invalid("Unknown condition fields");

		const attr = attributes.find((item) => item.id === node.attribute);

		if (!attr || !operators[attr.type].includes(String(node.operator)))
			return invalid("Unknown attribute or incompatible operator");

		if (node.operator === "between") {
			if (
				!Array.isArray(node.value) ||
				node.value.length !== 2 ||
				!node.value.every((v) => validValue(attr.type, v)) ||
				node.value[0] > node.value[1]
			)
				return invalid(
					"Between needs two ascending values; use OR for overnight windows",
				);
		} else if (!validValue(attr.type, node.value))
			return invalid(`Invalid ${attr.type} value`);

		if (node.operator === "regex") {
			if ((node.value as string).length > limits.regex)
				return invalid("Regular expression is too long");

			try {
				RE2JS.compile(node.value as string);
			} catch {
				return invalid(
					"Invalid RE2 expression; lookarounds and backreferences are unsupported",
				);
			}
		}
	}

	for (const rule of input.rules) {
		if (
			!record(rule) ||
			!exactKeys(rule, ["when", "visibility"]) ||
			!visibility(rule.visibility)
		)
			return invalid("Invalid rule outcome");

		visit(rule.when, 1);
	}

	return input as unknown as Ruleset;
}

export type Context = Record<string, string | number | undefined>;

type Match = boolean | undefined;

type Predicate = (context: Context) => Match;

function compileCondition(condition: Condition): Predicate {
	if ("all" in condition) {
		const children = condition.all.map(compileCondition);

		return (ctx) => {
			const results = children.map((test) => test(ctx));

			return results.includes(false)
				? false
				: results.includes(undefined)
					? undefined
					: true;
		};
	}

	if ("any" in condition) {
		const children = condition.any.map(compileCondition);

		return (ctx) => {
			const results = children.map((test) => test(ctx));

			return results.includes(true)
				? true
				: results.includes(undefined)
					? undefined
					: false;
		};
	}

	if ("not" in condition) {
		const test = compileCondition(condition.not);

		return (ctx) => {
			const result = test(ctx);
			return result === undefined ? undefined : !result;
		};
	}

	const { attribute, operator, value } = condition;
	const regex = operator === "regex" ? RE2JS.compile(value as string) : null;

	return (ctx) => {
		const actual = ctx[attribute];
		if (actual === undefined) return undefined;

		if (operator === "between") {
			const [lo, hi] = value as [string | number, string | number];
			return actual >= lo && actual <= hi;
		}

		const target = value as string | number;

		switch (operator) {
			case "equals":
				return actual === target;
			case "before":
			case "lessThan":
				return actual < target;
			case "after":
			case "greaterThan":
				return actual > target;
			case "lessOrEqual":
				return actual <= target;
			case "greaterOrEqual":
				return actual >= target;
			case "contains":
				return String(actual).includes(String(target));
			case "startsWith":
				return String(actual).startsWith(String(target));
			case "endsWith":
				return String(actual).endsWith(String(target));
			case "regex":
				return regex!.test(String(actual));
			default:
				return false;
		}
	};
}

export type RuleExplanation = {
	visibility: Visibility;
	ruleIndex: number | null;
	reason: string;
	timezone: string;
	matchedAt: string | null;
	conditions: Array<{ path: string; label: string; result: string }>;
};

function conditionTrace(
	condition: Condition,
	context: Context,
	path = "condition",
): RuleExplanation["conditions"] {
	const match = compileCondition(condition)(context);

	const result =
		match === undefined ? "unknown" : match ? "matched" : "not matched";

	if ("all" in condition || "any" in condition) {
		const children = "all" in condition ? condition.all : condition.any;

		return [
			{
				path,
				label:
					"all" in condition
						? "AND — all conditions"
						: "OR — any condition",
				result,
			},
			...children.flatMap((child, i) =>
				conditionTrace(child, context, `${path}.${i + 1}`),
			),
		];
	}

	if ("not" in condition)
		return [
			{ path, label: "NOT", result },
			...conditionTrace(condition.not, context, `${path}.1`),
		];

	const actual = context[condition.attribute];

	return [
		{
			path,
			label: `${condition.attribute} ${condition.operator} ${JSON.stringify(condition.value)}; actual: ${actual === undefined ? "unknown" : String(actual).slice(0, 256)}`,
			result,
		},
	];
}

type CompiledRuleset = ((context: Context) => Visibility) & {
	explain: (
		context: Context,
		start: Date,
		end: Date,
		timezone: string,
	) => RuleExplanation;
	during: (
		context: Context,
		start: Date,
		end: Date,
		timezone: string,
	) => Visibility;
};

function temporalBoundaries(condition: Condition, times: Set<string>): boolean {
	if ("all" in condition || "any" in condition)
		return ("all" in condition ? condition.all : condition.any)
			.map((child) => temporalBoundaries(child, times))
			.some(Boolean);

	if ("not" in condition) return temporalBoundaries(condition.not, times);

	if (condition.attribute === "timegrid.time") {
		for (const value of [condition.value].flat()) {
			const time = Temporal.PlainTime.from(String(value));
			times.add(time.toString({ smallestUnit: "minute" }));

			times.add(
				time.add({ minutes: 1 }).toString({ smallestUnit: "minute" }),
			);
		}
	}

	return condition.attribute.startsWith("timegrid.");
}

const cache = new Map<string, CompiledRuleset>();

export function compileRuleset(input: unknown): CompiledRuleset {
	const serialized = JSON.stringify(input);

	if (!serialized || serialized.length > 65536)
		return invalid("Ruleset is too large");

	const key = createHash("sha256").update(serialized).digest("hex");
	const cached = cache.get(key);

	if (cached) {
		cache.delete(key);
		cache.set(key, cached);
		return cached;
	}

	const ruleset = validateRuleset(input);

	const rules = ruleset.rules.map((rule) => {
		const times = new Set<string>(["00:00"]);
		const temporal = temporalBoundaries(rule.when, times);

		return {
			test: compileCondition(rule.when),
			visibility: rule.visibility,
			times: [...times],
			temporal,
		};
	});

	const evaluate = (context: Context) =>
		rules.find((rule) => rule.test(context))?.visibility ??
		ruleset.fallback;

	const decide = (
		context: Context,
		start: Date,
		end: Date,
		timezone: string,
		diagnostic = false,
	): RuleExplanation => {
		const decision = (
			visibility: Visibility,
			reason: string,
			ruleIndex: number | null = null,
			matchedAt: Date | null = null,
		): RuleExplanation => ({
			visibility,
			reason,
			ruleIndex,
			timezone,
			matchedAt: matchedAt?.toISOString() || null,
			conditions:
				!diagnostic || ruleIndex === null
					? []
					: conditionTrace(ruleset.rules[ruleIndex].when, {
							...context,
							...timegrid(matchedAt || start, timezone),
						}),
		});

		if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start)
			return decision(
				"hidden",
				"Evaluation limit or invalid event interval",
			);

		let budget = limits.evaluationPoints;
		const initial = { ...context, ...timegrid(start, timezone) };

		for (const [index, rule] of rules.entries()) {
			if (rule.test(initial))
				return decision(
					rule.visibility,
					"First matching rule",
					index,
					start,
				);

			if (!rule.temporal || +end === +start) continue;
			// Event intervals are half-open. Test only points at which a predicate can change,
			// including both occurrences of ambiguous local times and offset transitions.
			if (+end - +start > limits.intervalDays * 86400000)
				return decision(
					"hidden",
					"Evaluation limit or invalid event interval",
				);

			let day = Temporal.Instant.fromEpochMilliseconds(+start)
				.toZonedDateTimeISO(timezone)
				.toPlainDate();

			const last = Temporal.Instant.fromEpochMilliseconds(+end - 1)
				.toZonedDateTimeISO(timezone)
				.toPlainDate();

			while (Temporal.PlainDate.compare(day, last) <= 0) {
				const points = new Set<number>();
				const midnight = day.toZonedDateTime(timezone);
				const transition = midnight.getTimeZoneTransition("next");

				if (
					transition &&
					transition.epochMilliseconds <
						midnight.add({ days: 1 }).epochMilliseconds
				)
					points.add(transition.epochMilliseconds);

				for (const time of rule.times) {
					const local = day.toPlainDateTime(time);

					for (const disambiguation of ["earlier", "later"] as const)
						points.add(
							local.toZonedDateTime(timezone, { disambiguation })
								.epochMilliseconds,
						);
				}

				for (const instant of points) {
					if (--budget < 0)
						return decision(
							"hidden",
							"Evaluation limit or invalid event interval",
						);

					if (
						instant > +start &&
						instant < +end &&
						rule.test({
							...context,
							...timegrid(new Date(instant), timezone),
						})
					)
						return decision(
							rule.visibility,
							"First matching rule during event overlap",
							index,
							new Date(instant),
						);
				}

				day = day.add({ days: 1 });
			}
		}

		return decision(
			ruleset.fallback,
			"No rule matched; ruleset fallback applies",
		);
	};

	const compiled = Object.assign(evaluate, {
		during: (context: Context, start: Date, end: Date, timezone: string) =>
			decide(context, start, end, timezone).visibility,
		explain: (context: Context, start: Date, end: Date, timezone: string) =>
			decide(context, start, end, timezone, true),
	});

	if (cache.size >= limits.cache) cache.delete(cache.keys().next().value!);
	cache.set(key, compiled);
	return compiled;
}

export function stricter(a: Visibility, b: Visibility): Visibility {
	return visibilities[
		Math.min(visibilities.indexOf(a), visibilities.indexOf(b))
	];
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function timegrid(instant: Date, timezone: string): Context {
	let formatter = formatters.get(timezone);

	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-GB", {
			timeZone: timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			weekday: "long",
			hourCycle: "h23",
		});

		if (formatters.size >= 64)
			formatters.delete(formatters.keys().next().value!);

		formatters.set(timezone, formatter);
	}

	const fields = Object.fromEntries(
		formatter.formatToParts(instant).map((part) => [part.type, part.value]),
	);

	return {
		"timegrid.date": `${fields.year}-${fields.month}-${fields.day}`,
		"timegrid.time": `${fields.hour}:${fields.minute}`,
		"timegrid.day": fields.weekday.toLowerCase(),
	};
}
