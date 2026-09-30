import { defineConfig, devices } from "@playwright/test";

const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith("_test"))
	throw new Error(
		"TEST_DATABASE_URL must point to the upgraded disposable database",
	);

export default defineConfig({
	testDir: "./tests/e2e",
	workers: 1,
	timeout: 60000,
	use: { baseURL: "http://127.0.0.1:3300", trace: "retain-on-failure" },
	projects: [{ name: "firefox", use: { ...devices["Desktop Firefox"] } }],
	webServer: [
		{
			command: "node ../backend/dist/index.js",
			url: "http://127.0.0.1:4400/ready",
			env: {
				DATABASE_URL: databaseUrl,
				JWT_SECRET: "browser-test-secret",
				CREDENTIAL_ENCRYPTION_KEY: "ab".repeat(32),
				PORT: "4400",
				PUBLIC_URL: "http://127.0.0.1:3300",
			},
		},
		{ command: "node tests/e2e/feed.mjs", url: "http://127.0.0.1:4401" },
		{
			command: "npm run dev -- --port 3300",
			url: "http://127.0.0.1:3300",
			env: {
				BACKEND_URL: "http://127.0.0.1:4400",
				NEXT_DIST_DIR: ".next-e2e",
			},
			timeout: 120000,
		},
	],
});
