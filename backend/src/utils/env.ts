import dotenv from "dotenv";

dotenv.config();

function getEnv(key: string, defaultValue?: string): string {
    const value = process.env[key] || defaultValue;
    if (!value) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
}

function getOptionalEnv(key: string): string | undefined {
    return process.env[key] || undefined;
}

export const env = {
    DATABASE_URL: getEnv("DATABASE_URL"),
    JWT_SECRET: getEnv("JWT_SECRET"),
    PORT: parseInt(getEnv("PORT", "3000"), 10),
    NODE_ENV: getEnv("NODE_ENV", "development"),
    google: {
        clientId: getOptionalEnv("GOOGLE_CLIENT_ID"),
        clientSecret: getOptionalEnv("GOOGLE_CLIENT_SECRET"),
        redirectUri: getOptionalEnv("GOOGLE_REDIRECT_URI"),
        apiUrl:
            getOptionalEnv("GOOGLE_CALENDAR_API_URL") ??
            "https://www.googleapis.com/calendar/v3",
    },
    publicUrl: getEnv("PUBLIC_URL", "http://localhost:3000"),
};

export function isGoogleConfigured(): boolean {
    if (
        !env.google.clientId ||
        !env.google.clientSecret ||
        !env.google.redirectUri
    ) {
        console.log(
            "Google integration not configured. Missing one of: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI",
        );
        return false;
    }
    return true;
}
