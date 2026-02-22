import { describe, it, expect, beforeAll, vi } from "vitest";

describe("Env Module", () => {
    beforeAll(() => {
        global.fetch = vi.fn().mockResolvedValue({
            json: async () => ({
                API_URL: "https://test-api.com",
                ICS_BASE_URL: "https://test-ics.com",
            }),
        });
    });

    it("should export env object with required properties", async () => {
        const { env } = await import("../../lib/env");

        expect(env).toBeDefined();
        expect(env).toHaveProperty("API_URL");
        expect(env).toHaveProperty("ICS_BASE_URL");
    });

    it("should have string type for API_URL", async () => {
        const { env } = await import("../../lib/env");

        expect(typeof env.API_URL).toBe("string");
    });

    it("should have string type for ICS_BASE_URL", async () => {
        const { env } = await import("../../lib/env");

        expect(typeof env.ICS_BASE_URL).toBe("string");
    });

    it("should have default or loaded values", async () => {
        const { env } = await import("../../lib/env");

        expect(env.API_URL).toBeDefined();
        expect(env.ICS_BASE_URL).toBeDefined();
        expect(env.ICS_BASE_URL.length).toBeGreaterThan(0);
    });
});
