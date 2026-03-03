import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../src/handlers/registry", () => ({
    getProviderHandler: vi.fn(),
}));

import {
    handleProviderImport,
    handleProviderAuthUrl,
} from "../../src/services/importService";
import { getProviderHandler } from "../../src/handlers/registry";

describe("importService provider dispatch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("delegates import to provider handler", async () => {
        const importFn = vi.fn().mockResolvedValue({ success: true });
        vi.mocked(getProviderHandler).mockReturnValue({
            import: importFn,
        } as any);

        const payload = { userId: "u1", name: "ICS" };
        const result = await handleProviderImport("ics", payload);

        expect(result).toEqual({ success: true });
        expect(getProviderHandler).toHaveBeenCalledWith("ics");
        expect(importFn).toHaveBeenCalledWith(payload);
    });

    it("returns error when provider import is unsupported", async () => {
        vi.mocked(getProviderHandler).mockReturnValue({} as any);

        const result = await handleProviderImport("unknown", { x: 1 });

        expect(result).toEqual({
            error: "Provider not found or import not supported",
        });
    });

    it("delegates auth-url generation to handler", async () => {
        const getAuthUrl = vi
            .fn()
            .mockResolvedValue("https://auth.example.com");
        vi.mocked(getProviderHandler).mockReturnValue({
            getAuthUrl,
        } as any);

        const result = await handleProviderAuthUrl("google", {
            userId: "u1",
        });

        expect(result).toEqual({ url: "https://auth.example.com" });
        expect(getAuthUrl).toHaveBeenCalledWith({ userId: "u1" });
    });

    it("returns structured error when auth-url capability is missing", async () => {
        vi.mocked(getProviderHandler).mockReturnValue({} as any);

        const result = await handleProviderAuthUrl("ics", { userId: "u1" });

        expect(result).toEqual({
            error: "Provider not found or auth url not supported",
        });
    });

    it("passes through object result from handler getAuthUrl", async () => {
        const getAuthUrl = vi
            .fn()
            .mockResolvedValue({ error: "not-configured" });
        vi.mocked(getProviderHandler).mockReturnValue({
            getAuthUrl,
        } as any);

        const result = await handleProviderAuthUrl("google", {
            userId: "u1",
        });

        expect(result).toEqual({ error: "not-configured" });
    });
});
