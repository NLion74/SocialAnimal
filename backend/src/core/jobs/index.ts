import type { FastifyBaseLogger } from "fastify";

export type JobLogger = Pick<
	FastifyBaseLogger,
	"info" | "warn" | "error" | "debug"
>;

// Infrastructure runner knows only the injected work function.
export function startRunner(
	tick: () => Promise<void>,
	intervalMs = 15000,
	options?: { name: string; logger: JobLogger },
) {
	let running = false;
	let stopped = false;
	let current = Promise.resolve();

	const run = () => {
		if (running || stopped) return;
		running = true;

		current = tick()
			.catch(() => {
				if (options)
					options.logger.error(
						{ job: options.name },
						"Background job tick failed",
					);
				else console.error("Background job tick failed");
			})
			.finally(() => {
				running = false;
			});
	};

	const timer = setInterval(run, intervalMs);

	options?.logger.info(
		{ job: options.name, intervalMs },
		"Background runner started",
	);

	run();

	return async () => {
		stopped = true;
		clearInterval(timer);
		await current;
	};
}
