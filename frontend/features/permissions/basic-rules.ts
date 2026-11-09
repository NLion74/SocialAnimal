import type { Condition } from "./api";

export const weekdays = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
] as const;
export type Day = (typeof weekdays)[number];
export type TextFilter = { operator: "equals" | "contains"; value: string };
export type BasicFilters = {
	days?: Day[];
	time?: [string, string];
	date?: [string, string];
	title?: TextFilter;
	description?: TextFilter;
};

// Only decode shapes that Basic can reproduce without changing their meaning.
export function decodeBasic(condition: Condition): BasicFilters | null {
	const filters: BasicFilters = {};
	const children = "all" in condition ? condition.all : [condition];
	if (!children.length) return null;

	for (const child of children) {
		if ("any" in child) {
			if (filters.days || !child.any.length) return null;
			const days: Day[] = [];
			for (const item of child.any) {
				if (
					!("attribute" in item) ||
					item.attribute !== "timegrid.day" ||
					item.operator !== "equals" ||
					!weekdays.includes(item.value as Day) ||
					days.includes(item.value as Day)
				)
					return null;
				days.push(item.value as Day);
			}
			filters.days = days;
			continue;
		}
		if (!("attribute" in child)) return null;
		const { attribute, operator, value } = child;
		if (
			attribute === "timegrid.day" &&
			operator === "equals" &&
			weekdays.includes(value as Day) &&
			!filters.days
		) {
			filters.days = [value as Day];
		} else if (
			(attribute === "timegrid.time" || attribute === "timegrid.date") &&
			operator === "between" &&
			Array.isArray(value) &&
			value.length === 2 &&
			value.every((item) => typeof item === "string")
		) {
			const key = attribute === "timegrid.time" ? "time" : "date";
			if (filters[key]) return null;
			filters[key] = value as [string, string];
		} else if (
			(attribute === "event.title" ||
				attribute === "event.description") &&
			(operator === "equals" || operator === "contains") &&
			typeof value === "string"
		) {
			const key = attribute === "event.title" ? "title" : "description";
			if (filters[key]) return null;
			filters[key] = { operator, value };
		} else return null;
	}
	return filters;
}

export function encodeBasic(filters: BasicFilters): Condition {
	const all: Condition[] = [];
	if (filters.days?.length) {
		const days = filters.days.map((value): Condition => ({
			attribute: "timegrid.day",
			operator: "equals",
			value,
		}));
		all.push(days.length === 1 ? days[0] : { any: days });
	}
	for (const key of ["time", "date"] as const) {
		if (filters[key])
			all.push({
				attribute: `timegrid.${key}`,
				operator: "between",
				value: filters[key],
			});
	}
	for (const key of ["title", "description"] as const) {
		if (filters[key])
			all.push({ attribute: `event.${key}`, ...filters[key] });
	}
	return all.length === 1 ? all[0] : { all };
}

export function basicError(filters: BasicFilters): string | null {
	if (!Object.keys(filters).length)
		return "Choose at least one filter. Use default visibility for all events.";
	if (filters.days && !filters.days.length)
		return "Choose at least one weekday.";
	for (const key of ["time", "date"] as const) {
		const range = filters[key];
		if (range && (!range[0] || !range[1]))
			return `Complete both ${key} fields.`;
		if (range && range[0] > range[1])
			return key === "time"
				? "End time must be at or after start time on the same day."
				: "End date must be at or after start date.";
	}
	for (const key of ["title", "description"] as const) {
		if (filters[key] && !filters[key].value.trim())
			return `Enter the ${key} to match.`;
	}
	return null;
}

export function describeBasic(filters: BasicFilters): string {
	const parts: string[] = [];
	if (filters.days)
		parts.push(
			filters.days
				.map((day) => day[0].toUpperCase() + day.slice(1))
				.join(", "),
		);
	if (filters.time) parts.push(`${filters.time[0]}–${filters.time[1]}`);
	if (filters.date) parts.push(`${filters.date[0]} to ${filters.date[1]}`);
	for (const key of ["title", "description"] as const) {
		const field = filters[key];
		if (field)
			parts.push(
				`${key === "title" ? "Title" : "Description"} ${field.operator === "equals" ? "is" : "contains"} “${field.value}”`,
			);
	}
	return parts.join(" · ");
}
