import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/handlers/registry", () => ({
    getProviderHandler: vi.fn(),
}));

import { handleProviderDiscover } from "../../src/services/discoverService";
import { getProviderHandler } from "../../src/handlers/registry";

describe("discoverService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns error when provider does not support discover", async () => {
        vi.mocked(getProviderHandler).mockReturnValue(undefined);

        const result = await handleProviderDiscover("unknown", {});

        expect(result).toEqual({
            error: "Provider not found or discover not supported",
        });
    });

    it("delegates discover to provider handler", async () => {
        const discover = vi
            .fn()
            .mockResolvedValue({ calendars: [{ id: "1" }] });
        vi.mocked(getProviderHandler).mockReturnValue({ discover } as any);

        const params = { accessToken: "token" };
        const result = await handleProviderDiscover("google", params);

        expect(discover).toHaveBeenCalledWith(params);
        expect(result).toEqual({ calendars: [{ id: "1" }] });
    });
});
