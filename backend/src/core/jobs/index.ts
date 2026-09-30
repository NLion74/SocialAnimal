// Infrastructure runner knows only the injected work function.
export function startRunner(tick: () => Promise<void>, intervalMs = 15000) {
	let running = false;
	let stopped = false;
	let current = Promise.resolve();

	const run = () => {
		if (running || stopped) return;
		running = true;

		current = tick()
			.catch(() => {
				console.error("Background job tick failed");
			})
			.finally(() => {
				running = false;
			});
	};

	const timer = setInterval(run, intervalMs);
	run();

	return async () => {
		stopped = true;
		clearInterval(timer);
		await current;
	};
}
