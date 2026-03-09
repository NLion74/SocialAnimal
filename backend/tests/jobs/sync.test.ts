import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    runDueCalendarsMock: vi.fn(),
}));

vi.mock("../../src/services/providerService", () => ({
    runDueCalendars: mocks.runDueCalendarsMock,
}));

import { runDueCalendars, runSyncJob } from "../../src/jobs/sync";

describe("jobs/sync", () => {
    it("runSyncJob delegates to runDueCalendars", async () => {
        mocks.runDueCalendarsMock.mockResolvedValueOnce(undefined);

        await runSyncJob();

        expect(mocks.runDueCalendarsMock).toHaveBeenCalledTimes(1);
    });

    it("re-exports runDueCalendars", () => {
        expect(runDueCalendars).toBe(mocks.runDueCalendarsMock);
    });
});
