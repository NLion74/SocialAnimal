// Loaded as a module in both development and production; never serialize transpiled functions.
const { parentPort, workerData } = require("node:worker_threads");

const ical = require("node-ical");

const { sources, window, maximum } = workerData;

const events = [];

const text = (value) =>
	typeof value === "object" && value !== null
		? String(value.val ?? "")
		: String(value ?? "");

try {
	for (const source of sources) {
		const unfolded = source.replace(/\r?\n[ \t]/g, "");

		const timezoneBlock = unfolded.match(
			/^BEGIN:VTIMEZONE\r?\n([\s\S]*?)^END:VTIMEZONE\r?$/m,
		)?.[1];

		const zone =
			unfolded.match(/^X-WR-TIMEZONE:(.+)$/m)?.[1]?.trim() ||
			unfolded.match(/^TIMEZONE-ID:(.+)$/m)?.[1]?.trim() ||
			timezoneBlock?.match(/^TZID:(.+)$/m)?.[1]?.trim() ||
			workerData.timezone;

		new Intl.DateTimeFormat("en", { timeZone: zone });
		// Floating times follow the calendar's timezone, falling back to its owner.
		const zoned = unfolded.replace(
			/^(DTSTART|DTEND|RECURRENCE-ID|EXDATE|RDATE):(\d{8}T\d{6}(?:,\d{8}T\d{6})*)\r?$/gm,
			(_, key, values) => `${key};TZID=${zone}:${values}`,
		);

		const parsed = ical.parseICS(zoned);

		for (const event of Object.values(parsed)) {
			if (event?.type !== "VEVENT" || event.status === "CANCELLED")
				continue;

			if (
				!event.uid ||
				!event.start ||
				!event.end ||
				!Number.isFinite(+event.start) ||
				!Number.isFinite(+event.end) ||
				+event.end < +event.start
			)
				throw new Error("Invalid event");

			const instances = ical.expandRecurringEvent(event, {
				from: window.start,
				to: window.end,
				expandOngoing: true,
			});

			for (const instance of instances) {
				if (
					instance.event.status === "CANCELLED" ||
					instance.start >= window.end ||
					instance.end <= window.start
				)
					continue;

				const occurrence =
					instance.event.recurrenceid || instance.start;

				const externalId =
					event.rrule && +occurrence !== +event.start
						? `${event.uid}::${occurrence.toISOString()}`
						: String(event.uid);

				events.push({
					isRecurring: !!(
						event.rrule ||
						event.rdate ||
						event.recurrenceid ||
						instance.event.recurrenceid
					),
					externalId,
					summary: text(instance.summary) || "Untitled",
					description: text(instance.event.description) || null,
					location: text(instance.event.location) || null,
					startTime: instance.start,
					endTime: instance.end,
					allDay: instance.isFullDay,
					blocksTime:
						text(instance.event.transparency).toUpperCase() !==
						"TRANSPARENT",
				});

				if (events.length > maximum)
					throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
			}
		}
	}

	parentPort.postMessage({ events });
} catch (error) {
	parentPort.postMessage({
		error:
			error.message === "PROVIDER_RESPONSE_TOO_LARGE" ||
			/^Maximum iterations \(\d+\) exceeded in all\(\)$/.test(
				error.message,
			)
				? "PROVIDER_RESPONSE_TOO_LARGE"
				: "PROVIDER_INVALID_CALENDAR",
	});
}
