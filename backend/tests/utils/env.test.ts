import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

const REQUIRED_ENV = {
    DATABASE_URL: "postgresql://localhost/test",
    JWT_SECRET: "test-secret",
    PUBLIC_URL: "http://localhost:3000",
    PORT: "3000",
    NODE_ENV: "test",
};

const GOOGLE_ENV = {
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    GOOGLE_REDIRECT_URI: undefined,
    GOOGLE_CALENDAR_API_URL: undefined,
};

function setEnv(overrides: Record<string, string | undefined>) {
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

beforeEach(() => {
    setEnv({ ...REQUIRED_ENV, ...GOOGLE_ENV });
});

afterEach(() => {
    vi.resetModules();
    setEnv(
        Object.fromEntries(
            [...Object.keys(REQUIRED_ENV), ...Object.keys(GOOGLE_ENV)].map(
                (k) => [k, undefined],
            ),
        ),
    );
});

async function loadEnv() {
    return import("../../src/utils/env");
}

describe("required environment variables", () => {
    it("loads DATABASE_URL", async () => {
        const { env } = await loadEnv();
        expect(env.DATABASE_URL).toBe("postgresql://localhost/test");
    });

    it("loads JWT_SECRET", async () => {
        const { env } = await loadEnv();
        expect(env.JWT_SECRET).toBe("test-secret");
    });

    it("parses PORT as integer", async () => {
        const { env } = await loadEnv();
        expect(env.PORT).toBe(3000);
        expect(typeof env.PORT).toBe("number");
    });

    it("defaults PORT to 3000 when not set", async () => {
        setEnv({ PORT: undefined });
        const { env } = await loadEnv();
        expect(env.PORT).toBe(3000);
    });

    it("uses custom PORT when set", async () => {
        setEnv({ PORT: "8080" });
        const { env } = await loadEnv();
        expect(env.PORT).toBe(8080);
    });

    it("defaults NODE_ENV to development when not set", async () => {
        setEnv({ NODE_ENV: undefined });
        const { env } = await loadEnv();
        expect(env.NODE_ENV).toBe("development");
    });

    it("uses provided NODE_ENV", async () => {
        setEnv({ NODE_ENV: "production" });
        const { env } = await loadEnv();
        expect(env.NODE_ENV).toBe("production");
    });

    it("defaults publicUrl to http://localhost:3000", async () => {
        setEnv({ PUBLIC_URL: undefined });
        const { env } = await loadEnv();
        expect(env.publicUrl).toBe("http://localhost:3000");
    });

    it("uses provided PUBLIC_URL", async () => {
        setEnv({ PUBLIC_URL: "https://myapp.com" });
        const { env } = await loadEnv();
        expect(env.publicUrl).toBe("https://myapp.com");
    });

    it("throws when DATABASE_URL is missing", async () => {
        setEnv({ DATABASE_URL: undefined });
        await expect(loadEnv()).rejects.toThrow(
            "Missing environment variable: DATABASE_URL",
        );
    });

    it("throws when JWT_SECRET is missing", async () => {
        setEnv({ JWT_SECRET: undefined });
        await expect(loadEnv()).rejects.toThrow(
            "Missing environment variable: JWT_SECRET",
        );
    });
});

describe("google configuration", () => {
    it("returns undefined for unconfigured google vars", async () => {
        const { env } = await loadEnv();
        expect(env.google.clientId).toBeUndefined();
        expect(env.google.clientSecret).toBeUndefined();
        expect(env.google.redirectUri).toBeUndefined();
    });

    it("loads google vars when set", async () => {
        setEnv({
            GOOGLE_CLIENT_ID: "client-id",
            GOOGLE_CLIENT_SECRET: "client-secret",
            GOOGLE_REDIRECT_URI: "http://localhost:3000/callback",
        });
        const { env } = await loadEnv();
        expect(env.google.clientId).toBe("client-id");
        expect(env.google.clientSecret).toBe("client-secret");
        expect(env.google.redirectUri).toBe("http://localhost:3000/callback");
    });

    it("defaults apiUrl to Google Calendar API", async () => {
        const { env } = await loadEnv();
        expect(env.google.apiUrl).toBe(
            "https://www.googleapis.com/calendar/v3",
        );
    });

    it("uses custom GOOGLE_CALENDAR_API_URL when set", async () => {
        setEnv({ GOOGLE_CALENDAR_API_URL: "http://mock-google-api" });
        const { env } = await loadEnv();
        expect(env.google.apiUrl).toBe("http://mock-google-api");
    });
});

describe("isGoogleConfigured", () => {
    it("returns false when all google vars are missing", async () => {
        const { isGoogleConfigured } = await loadEnv();
        expect(isGoogleConfigured()).toBe(false);
    });

    it("returns false when only clientId is set", async () => {
        setEnv({ GOOGLE_CLIENT_ID: "id" });
        const { isGoogleConfigured } = await loadEnv();
        expect(isGoogleConfigured()).toBe(false);
    });

    it("returns false when only clientSecret is set", async () => {
        setEnv({ GOOGLE_CLIENT_SECRET: "secret" });
        const { isGoogleConfigured } = await loadEnv();
        expect(isGoogleConfigured()).toBe(false);
    });

    it("returns false when only redirectUri is set", async () => {
        setEnv({ GOOGLE_REDIRECT_URI: "http://localhost/callback" });
        const { isGoogleConfigured } = await loadEnv();
        expect(isGoogleConfigured()).toBe(false);
    });

    it("returns false when clientId and clientSecret set but redirectUri missing", async () => {
        setEnv({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
        const { isGoogleConfigured } = await loadEnv();
        expect(isGoogleConfigured()).toBe(false);
    });

    it("returns true when all three google vars are set", async () => {
        setEnv({
            GOOGLE_CLIENT_ID: "id",
            GOOGLE_CLIENT_SECRET: "secret",
            GOOGLE_REDIRECT_URI: "http://localhost/callback",
        });
        const { isGoogleConfigured } = await loadEnv();
        expect(isGoogleConfigured()).toBe(true);
    });

    it("logs warning when not configured", async () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const { isGoogleConfigured } = await loadEnv();
        isGoogleConfigured();
        expect(spy).toHaveBeenCalledWith(
            expect.stringContaining("Google integration not configured"),
        );
        spy.mockRestore();
    });

    it("does not log warning when fully configured", async () => {
        setEnv({
            GOOGLE_CLIENT_ID: "id",
            GOOGLE_CLIENT_SECRET: "secret",
            GOOGLE_REDIRECT_URI: "http://localhost/callback",
        });
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const { isGoogleConfigured } = await loadEnv();
        isGoogleConfigured();
        expect(spy).not.toHaveBeenCalledWith(
            expect.stringContaining("Google integration not configured"),
        );
        spy.mockRestore();
    });
});
