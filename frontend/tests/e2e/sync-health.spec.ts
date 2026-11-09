import { test, expect } from "./fixtures";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

test("connection tests cannot overwrite persisted sync health and recovery clears old warnings", async ({
	page,
	request,
}) => {
	const email = `health-${randomUUID()}@example.test`;
	const password = "browser-health-password";
	const registered = await request.post("/api/v1/auth/registrations", {
		data: { email, password },
	});
	expect(registered.status()).toBe(201);
	const userId = (await registered.json()).id;
	const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
	await db.connect();

	try {
		await page.goto("/login");
		await page.getByLabel("Email", { exact: true }).fill(email);
		await page.getByLabel("Password", { exact: true }).fill(password);
		await page
			.getByRole("button", { name: "Sign In", exact: true })
			.click();
		await expect(page).toHaveURL(/dashboard/);
		let lastError: string | null =
			"The provider is temporarily unavailable. Try again shortly.";
		let testWorks = true;
		await page.route("**/api/v1/calendars?*", (route) =>
			route.fulfill({
				json: {
					items: [
						{
							id: "health-calendar",
							name: "Work",
							type: "ics",
							connectionId: "health-connection",
							syncInterval: 0,
							lastError,
							lastSync: "2026-11-03T10:00:00Z",
						},
					],
					nextCursor: null,
				},
			}),
		);
		await page.route(
			"**/api/v1/connections/health-connection/tests",
			(route) => route.fulfill({ json: { success: testWorks } }),
		);
		await page.route(
			"**/api/v1/calendars/health-calendar/sync-runs",
			(route) =>
				route.fulfill({
					status: 202,
					json: { id: "health-run", status: "queued" },
				}),
		);
		await page.route("**/api/v1/sync-runs/health-run", (route) => {
			lastError = null;
			return route.fulfill({
				json: {
					id: "health-run",
					status: "succeeded",
					eventsSynced: 3,
				},
			});
		});
		await page.clock.install();
		await page.reload();
		await expect(
			page.getByText("Calendar needs attention", { exact: true }),
		).toBeVisible();
		await page.getByTitle("Test Connection", { exact: true }).click();
		await expect(
			page.getByText("Connection works", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Calendar needs attention", { exact: true }),
		).toBeVisible();
		await page.getByTitle("Sync Calendar", { exact: true }).click();
		await expect(
			page.getByText("Calendar synchronized", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Calendar needs attention", { exact: true }),
		).toHaveCount(0);
		testWorks = false;
		await page.getByTitle("Test Connection", { exact: true }).click();
		await expect(
			page.getByText("Connection test failed", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Calendar needs attention", { exact: true }),
		).toHaveCount(0);
		await page.getByTitle("Sync Calendar", { exact: true }).click();
		await expect(
			page.getByText("Calendar synchronized", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Connection test failed", { exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByText("Calendar needs attention", { exact: true }),
		).toHaveCount(0);

		// A scheduled sync can fail and recover without any dashboard action.
		lastError =
			"The server could not resolve the provider hostname. Check the URL and server DNS configuration.";
		await page.evaluate(() => window.dispatchEvent(new Event("focus")));
		await expect(page.getByText(lastError, { exact: true })).toBeVisible();
		lastError = null;
		await page.clock.fastForward(15000);
		await expect(
			page.getByText("Calendar needs attention", { exact: true }),
		).toHaveCount(0);
	} finally {
		await db.query('DELETE FROM "User" WHERE id = $1', [userId]);
		await db.end();
	}
});
