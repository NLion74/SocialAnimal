// Navigation dates represent calendar dates in the selected timezone, not instants.
export function zonedParts(value: Date, timezone: string) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(value);

	const values = Object.fromEntries(
		parts
			.filter((part) => part.type !== "literal")
			.map((part) => [part.type, Number(part.value)]),
	);

	return {
		year: values.year,
		month: values.month,
		day: values.day,
		hour: values.hour,
		minute: values.minute,
		second: values.second,
	};
}

export function calendarToday(timezone: string) {
	const value = zonedParts(new Date(), timezone);
	return new Date(value.year, value.month - 1, value.day);
}

export function zonedDayStart(date: Date, timezone: string) {
	const target = Date.UTC(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	);

	let instant = target;

	for (let step = 0; step < 6; step++) {
		const parts = zonedParts(new Date(instant), timezone);

		const represented = Date.UTC(
			parts.year,
			parts.month - 1,
			parts.day,
			parts.hour,
			parts.minute,
			parts.second,
		);

		const difference = target - represented;
		if (!difference) break;
		instant += difference;
	}

	return new Date(instant);
}

export function dayBounds(date: Date, timezone: string) {
	const next = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate() + 1,
	);

	return {
		start: zonedDayStart(date, timezone),
		end: zonedDayStart(next, timezone),
	};
}
