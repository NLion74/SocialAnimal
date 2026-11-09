export type SyncRun = {
	id: string;
	status: string;
	error?: string | null;
	eventsSynced?: number | null;
};

export type SyncResult =
	| { status: "succeeded"; eventsSynced: number }
	| { status: "failed"; message: string }
	| { status: "pending" | "unknown"; runId: string };

// A polling deadline or network interruption says nothing about the job outcome.
export async function waitForSync(
	initial: SyncRun,
	read: (id: string) => Promise<SyncRun>,
	pause = () => new Promise<void>((resolve) => setTimeout(resolve, 1000)),
	attempts = 180,
): Promise<SyncResult> {
	let run = initial;
	for (
		let i = 0;
		i < attempts && (run.status === "queued" || run.status === "running");
		i++
	) {
		await pause();
		try {
			run = await read(run.id);
		} catch {
			return { status: "unknown", runId: run.id };
		}
	}
	if (run.status === "failed")
		return { status: "failed", message: run.error || "Sync failed" };
	if (run.status === "succeeded")
		return { status: "succeeded", eventsSynced: run.eventsSynced ?? 0 };
	return { status: "pending", runId: run.id };
}
