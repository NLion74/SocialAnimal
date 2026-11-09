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
	blocksTime: boolean;
};

// Parse and expand untrusted recurrence data off the server event loop, with memory/time limits.
export function parseWindow(
	sources: string[],
	window: SyncWindow,
	timezone = "UTC",
): Promise<ParsedWindowEvent[]> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(require.resolve("./window-worker.cjs"), {
			workerData: {
				sources,
				window,
				timezone,
				maximum: maxSnapshotEvents,
			},
			resourceLimits: { maxOldGenerationSizeMb: 128 },
		});

		let settled = false;

		const finish = (error?: Error, events?: ParsedWindowEvent[]) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			void worker.terminate();

			if (error) reject(error);
			else resolve(events!);
		};

		const timeout = setTimeout(
			() => finish(new Error("PROVIDER_TIMEOUT")),
			15000,
		);

		worker.once("message", (message) => {
			if (message.error)
				finish(
					new Error(
						message.error === "PROVIDER_RESPONSE_TOO_LARGE"
							? "PROVIDER_RESPONSE_TOO_LARGE"
							: "PROVIDER_INVALID_CALENDAR",
					),
				);
			else if (Array.isArray(message.events))
				finish(undefined, message.events);
			else finish(new Error("CALENDAR_PROCESSING_FAILED"));
		});

		worker.once("error", (error: Error & { code?: string }) => {
			finish(
				new Error(
					error.code === "ERR_WORKER_OUT_OF_MEMORY"
						? "PROVIDER_RESPONSE_TOO_LARGE"
						: "CALENDAR_PROCESSING_FAILED",
				),
			);
		});

		worker.once("exit", () =>
			finish(new Error("CALENDAR_PROCESSING_FAILED")),
		);
	});
}
