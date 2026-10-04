import { Worker } from "node:worker_threads";

export type SyncWindow = {
	start: Date;
	end: Date;
	pastDays: number;
	futureDays: number;
};

export const maxSnapshotEvents = 50000;

export type ParsedWindowEvent = {
	isRecurring: boolean;
	externalId: string;
	summary: string;
	description: string | null;
	location: string | null;
	startTime: Date;
	endTime: Date;
	allDay: boolean;
};

// Parse and expand untrusted recurrence data off the server event loop, with memory/time limits.
export function parseWindow(
	sources: string[],
	window: SyncWindow,
	timezone = "UTC",
): Promise<ParsedWindowEvent[]> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(`(${expandWorker.toString()})()`, {
			eval: true,
			workerData: {
				sources,
				window,
				timezone,
				maximum: maxSnapshotEvents,
				modulePath: require.resolve("node-ical"),
			},
			resourceLimits: { maxOldGenerationSizeMb: 128 },
		});

		const timeout = setTimeout(() => {
			void worker.terminate();
			reject(new Error("PROVIDER_TIMEOUT"));
		}, 15000);

		worker.once("message", (message) => {
			clearTimeout(timeout);

			if (message.error) reject(new Error("PROVIDER_INVALID_CALENDAR"));
			else resolve(message.events);
		});

		worker.once("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});

		worker.once("exit", (code) => {
			clearTimeout(timeout);
			if (code) reject(new Error("Calendar expansion failed"));
		});
	});
}

function expandWorker() {
	const { parentPort, workerData } = require("node:worker_threads");
	const ical = require(workerData.modulePath);
	const { sources, window, maximum } = workerData;
	const events: ParsedWindowEvent[] = [];

	const text = (value: any) =>
		typeof value === "object" && value !== null
			? String(value.val ?? "")
			: String(value ?? "");

	try {
		for (const source of sources) {
			const zone =
				source.match(/^X-WR-TIMEZONE:(.+)$/m)?.[1]?.trim() ||
				workerData.timezone;

			new Intl.DateTimeFormat("en", { timeZone: zone });
			// Floating times follow the calendar's timezone, falling back to its owner.
			const zoned = source.replace(
				/^(DTSTART|DTEND|RECURRENCE-ID|EXDATE|RDATE):(\d{8}T\d{6}(?:,\d{8}T\d{6})*)\r?$/gm,
				(_: string, key: string, values: string) =>
					`${key};TZID=${zone}:${values}`,
			);

			const parsed = ical.parseICS(zoned);

			for (const event of Object.values(parsed) as any[]) {
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
					});

					if (events.length > maximum)
						throw new Error("Snapshot too large");
				}
			}
		}

		parentPort.postMessage({ events });
	} catch {
		parentPort.postMessage({ error: true });
	}
}
