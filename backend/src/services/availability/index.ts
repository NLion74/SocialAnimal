import { Temporal } from "@js-temporal/polyfill";

export type Interval = { start: Date; end: Date };

export function dailyWindows(
	start: string,
	end: string,
	from: string,
	to: string,
	timezone: string,
): Interval[] {
	const first = Temporal.PlainDate.from(start);
	const last = Temporal.PlainDate.from(end);
	const count = first.until(last).days;

	if (count < 0 || count > 30 || from >= to)
		throw new Error(
			"Choose up to 31 days and an end time after the start time.",
		);

	return Array.from({ length: count + 1 }, (_, index) => {
		const day = first.add({ days: index });
		const instant = (time: string) =>
			new Date(
				day.toZonedDateTime({ timeZone: timezone, plainTime: time })
					.epochMilliseconds,
			);
		return { start: instant(from), end: instant(to) };
	});
}

// Only already-authorized intervals may cross this boundary. Hidden events never participate.
export function suggestedTimes(
	windows: Interval[],
	busy: Interval[],
	minutes: number,
	now = new Date(),
): Interval[] {
	const merged: Interval[] = [];

	for (const interval of [...busy].sort((a, b) => +a.start - +b.start)) {
		if (interval.end <= interval.start) continue;
		const previous = merged.at(-1);
		if (previous && interval.start <= previous.end)
			previous.end = new Date(Math.max(+previous.end, +interval.end));
		else merged.push({ ...interval });
	}

	const result: Interval[] = [];
	const duration = minutes * 60000;

	for (const window of windows) {
		let cursor = Math.max(+window.start, +now);
		const addGap = (end: number) => {
			// One suggestion per available gap, with its full available interval.
			if (end - cursor >= duration)
				result.push({ start: new Date(cursor), end: new Date(end) });
		};

		for (const interval of merged) {
			if (+interval.end <= cursor) continue;
			if (interval.start >= window.end) break;
			addGap(Math.min(+interval.start, +window.end));
			cursor = Math.max(cursor, +interval.end);
			if (cursor >= +window.end) break;
		}

		addGap(+window.end);
	}

	return result;
}
