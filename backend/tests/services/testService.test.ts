import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/handlers/registry", () => ({
    getProviderHandler: vi.fn(),
}));

import {
    handleProviderTest,
    testCalendarConnection,
} from "../../src/services/testService";
import { getProviderHandler } from "../../src/handlers/registry";

describe("testService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns error when provider does not support test", async () => {
        vi.mocked(getProviderHandler).mockReturnValue(undefined);

        const result = await handleProviderTest("unknown", {});

        expect(result).toEqual({
            error: "Provider not found or test not supported",
        });
    });

    it("delegates handleProviderTest to provider test", async () => {
        const test = vi.fn().mockResolvedValue({ success: true });
        vi.mocked(getProviderHandler).mockReturnValue({ test } as any);

        const credentials = { token: "abc" };
        const result = await handleProviderTest("google", credentials);

        expect(test).toHaveBeenCalledWith(credentials);
        expect(result).toEqual({ success: true });
    });

    it("returns error when calendar type has no test support", async () => {
        vi.mocked(getProviderHandler).mockReturnValue(undefined);

        const result = await testCalendarConnection(
            { type: "legacy", config: {} },
            "legacy",
        );

        expect(result).toEqual({
            success: false,
            error: "No test for type: legacy",
        });
    });

    it("delegates testCalendarConnection to provider test", async () => {
        const test = vi
            .fn()
            .mockResolvedValue({ success: true, eventsPreview: [] });
        vi.mocked(getProviderHandler).mockReturnValue({ test } as any);

        const calendar = {
            type: "ics",
            config: { url: "https://example.com/a.ics" },
        };
        const result = await testCalendarConnection(calendar, "ics");

        expect(test).toHaveBeenCalledWith(calendar.config);
        expect(result).toEqual({ success: true, eventsPreview: [] });
    });
});
