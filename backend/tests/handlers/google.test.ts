import { describe, it, expect } from "vitest";
import { GoogleHandler } from "../../src/handlers/google";

describe("GoogleHandler basic behavior", () => {
    const handler = new GoogleHandler();

    it("returns discover validation error when missing credentials", async () => {
        const result = await handler.discover({});

        expect(result).toEqual({ error: "accessToken or code is required" });
    });

    it("returns import validation error when missing required fields", async () => {
        const result = await handler.import({ userId: "user-1" });

        expect(result).toEqual({
            success: false,
            error: "calendarId and userId are required",
            eventsSynced: 0,
        });
    });

    it("returns test validation error for invalid config", async () => {
        const result = await handler.test({ accessToken: "x" });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Invalid Google config");
    });
});
