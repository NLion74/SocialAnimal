import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		fileParallelism: false,
		testTimeout: 30000,
		clearMocks: true,
		env: {
			NODE_ENV: "test",
			JWT_SECRET: "test-secret",
			DATABASE_URL:
				process.env.TEST_DATABASE_URL ||
				"postgresql://test:test@localhost:5432/unit_test",
			CREDENTIAL_ENCRYPTION_KEY: "ab".repeat(32),
		},
		include: ["tests/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: ["src/types/**"],
			reporter: ["text", "html"],
		},
	},
});
