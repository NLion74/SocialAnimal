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
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: [
                "src/**/*.d.ts",
                "src/types/**",
                "src/utils/db.ts",
                "src/syncs/base.ts",
                "src/index.ts",
                "src/app.ts",
            ],

            reporter: ["text", "html"],
            thresholds: {
                lines: 85,
                functions: 90,
                branches: 85,
                statements: 85,
            },
            reportOnFailure: true,
        },
    },
});
