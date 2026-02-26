import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        testTimeout: 30_000,
        clearMocks: true,
        setupFiles: ["./tests/setup.ts"],
        env: {
            NODE_ENV: "test",
            JWT_SECRET: "test-secret",
            DATABASE_URL: "postgresql://test:test@localhost:5432/test",
        },
    },
});
