import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/handlers/registry", () => ({
    getProviderHandler: vi.fn(),
}));

import { handleProviderExport } from "../../src/services/exportService";
import { getProviderHandler } from "../../src/handlers/registry";

describe("exportService provider dispatch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("delegates export to provider handler", async () => {
        const exportFn = vi.fn().mockResolvedValue({ body: "BEGIN:VCALENDAR" });
        vi.mocked(getProviderHandler).mockReturnValue({
            export: exportFn,
        } as any);

        const result = await handleProviderExport("ics", {
            calendarId: "cal-1",
            subscription: true,
        });

        expect(result).toEqual({ body: "BEGIN:VCALENDAR" });
        expect(exportFn).toHaveBeenCalledWith({
            calendarId: "cal-1",
            subscription: true,
        });
    });

    it("returns error when export is unsupported", async () => {
        vi.mocked(getProviderHandler).mockReturnValue({} as any);

        const result = await handleProviderExport("google", {
            calendarId: "cal-1",
        });

        expect(result).toEqual({
            error: "Provider not found or export not supported",
        });
    });
});
