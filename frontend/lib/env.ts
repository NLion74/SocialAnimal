function getEnv(key: string, defaultValue?: string): string {
    const value = process.env[key] ?? defaultValue;
    if (value === undefined) {
        throw new Error(`Missing environment variable: ${key}`);
    }
    return value;
}

export const env = {
    API_URL: process.env.NEXT_PUBLIC_API_URL ?? "",

    ICS_BASE_URL: getEnv("NEXT_PUBLIC_PUBLIC_URL", "http://localhost:3001"),
};
