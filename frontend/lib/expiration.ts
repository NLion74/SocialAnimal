import { zonedParts } from "./calendar-dates";

export function expirationLocal(instant: string, timezone: string) {
	const p = zonedParts(new Date(instant), timezone);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

// Resolve the owner's wall time without using the browser's timezone. During a
// repeated autumn hour, use the later occurrence; nonexistent spring times fail.
export function expirationInstant(local: string, timezone: string): string {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
		throw new Error("Enter a complete date and time.");
	const target = Date.parse(`${local}:00Z`);
	if (!Number.isFinite(target))
		throw new Error("Enter a valid date and time.");
	const offsets = new Set<number>();

	for (const hours of [-36, -12, 0, 12, 36]) {
		const sample = new Date(target + hours * 3600000);
		const p = zonedParts(sample, timezone);
		offsets.add(
			Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
				+sample,
		);
	}

	const matches = [...offsets]
		.map((offset) => new Date(target - offset).toISOString())
		.filter((instant) => expirationLocal(instant, timezone) === local)
		.sort();
	if (!matches.length)
		throw new Error(
			`This time does not exist in ${timezone} because the clocks change. Choose another time.`,
		);
	return matches[matches.length - 1];
}
