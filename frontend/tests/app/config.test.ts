import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET } from "../../app/config/route";
import { NextResponse } from "next/server";

describe("Config Route", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("should return config with environment variables", async () => {
        process.env.BACKEND_URL = "https://api.production.com";
        process.env.PUBLIC_URL = "https://app.production.com";

        const response = await GET();
        const data = await response.json();

        expect(data).toEqual({
            API_URL: "https://api.production.com",
            ICS_BASE_URL: "https://app.production.com",
        });
    });

    it("should use empty string for missing BACKEND_URL", async () => {
        delete process.env.BACKEND_URL;
        process.env.PUBLIC_URL = "https://app.example.com";

        const response = await GET();
        const data = await response.json();

        expect(data.API_URL).toBe("");
        expect(data.ICS_BASE_URL).toBe("https://app.example.com");
    });

    it("should use default localhost for missing PUBLIC_URL", async () => {
        process.env.BACKEND_URL = "https://api.example.com";
        delete process.env.PUBLIC_URL;

        const response = await GET();
        const data = await response.json();

        expect(data.API_URL).toBe("https://api.example.com");
        expect(data.ICS_BASE_URL).toBe("http://localhost:3000");
    });

    it("should use all defaults when no env vars set", async () => {
        delete process.env.BACKEND_URL;
        delete process.env.PUBLIC_URL;

        const response = await GET();
        const data = await response.json();

        expect(data).toEqual({
            API_URL: "",
            ICS_BASE_URL: "http://localhost:3000",
        });
    });

    it("should return NextResponse with JSON", async () => {
        const response = await GET();

        expect(response).toBeInstanceOf(NextResponse);
        expect(response.headers.get("content-type")).toContain(
            "application/json",
        );
    });

    it("should handle empty string env vars", async () => {
        process.env.BACKEND_URL = "";
        process.env.PUBLIC_URL = "";

        const response = await GET();
        const data = await response.json();

        expect(data.API_URL).toBe("");
        expect(data.ICS_BASE_URL).toBe("http://localhost:3000");
    });

    it("should trim and format URLs correctly", async () => {
        process.env.BACKEND_URL = "  https://api.example.com  ";
        process.env.PUBLIC_URL = "  https://app.example.com  ";

        const response = await GET();
        const data = await response.json();

        expect(data.API_URL).toBe("  https://api.example.com  ");
        expect(data.ICS_BASE_URL).toBe("  https://app.example.com  ");
    });
});
