import { describe, expect, it, vi } from "vitest";
import { waitForSync } from "../features/calendars/sync-status";

const queued = { id: "job", status: "queued" };
const pause = async () => {};

describe("Synchronization outcomes", () => {
	it("treats the polling deadline as pending", async () => {
		expect(
			await waitForSync(
				queued,
				async () => ({ ...queued, status: "running" }),
				pause,
				2,
			),
		).toEqual({ status: "pending", runId: "job" });
	});
	it("does not report a provider failure when polling is interrupted", async () => {
		expect(
			await waitForSync(
				queued,
				async () => {
					throw Error("Network");
				},
				pause,
			),
		).toEqual({ status: "unknown", runId: "job" });
	});
	it("reports only confirmed job failures as failed", async () => {
		expect(
			await waitForSync(
				queued,
				async () => ({
					...queued,
					status: "failed",
					error: "Provider unavailable",
				}),
				pause,
			),
		).toEqual({ status: "failed", message: "Provider unavailable" });
	});
	it("waits for success including complete empty snapshots", async () => {
		const read = vi
			.fn()
			.mockResolvedValueOnce({ ...queued, status: "running" })
			.mockResolvedValueOnce({
				...queued,
				status: "succeeded",
				eventsSynced: 0,
			});
		expect(await waitForSync(queued, read, pause)).toEqual({
			status: "succeeded",
			eventsSynced: 0,
		});
		expect(read).toHaveBeenCalledTimes(2);
	});
});
