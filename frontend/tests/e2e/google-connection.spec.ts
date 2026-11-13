import { test, expect } from "./fixtures";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

for (const callback of [
	"/api/providers/google/callback",
	"/api/v1/connections/google/callback",
]) {
	test(`Google authorization, callback, discovery and selection via ${callback}`, async ({
		page,
		request,
	}) => {
		const email = `google-${randomUUID()}@example.test`,
			password = "google-browser-password";
		const registration = await request.post("/api/v1/auth/registrations", {
			data: { email, password },
		});
		expect(registration.status()).toBe(201);
		const id = (await registration.json()).id;
		const db = new Client({
			connectionString: process.env.TEST_DATABASE_URL,
		});
		await db.connect();
		try {
			await page.route(
				"https://accounts.google.com/**",
				async (route) => {
					const url = new URL(route.request().url());
					expect(url.searchParams.get("redirect_uri")).toBe(
						"http://127.0.0.1:3300/api/providers/google/callback",
					);
					await route.fulfill({
						status: 302,
						headers: {
							location: `http://127.0.0.1:3300${callback}?${new URLSearchParams({ state: url.searchParams.get("state")!, code: "mock-google-code" })}`,
						},
					});
				},
			);
			await page.goto("/login");
			await page.getByLabel("Email", { exact: true }).fill(email);
			await page.getByLabel("Password", { exact: true }).fill(password);
			await page
				.getByRole("button", { name: "Sign In", exact: true })
				.click();
			await expect(page).toHaveURL(/dashboard/);
			await page
				.getByRole("button", { name: "Import Calendar", exact: true })
				.click();
			await page
				.getByRole("button", {
					name: "Google Calendar Connect your Google account",
					exact: true,
				})
				.click();
			await page
				.getByRole("button", { name: "Connect with Google" })
				.click();
			const dialog = page
				.getByRole("dialog")
				.filter({
					has: page.getByRole("heading", {
						name: "Select Google Calendars",
					}),
				});
			await expect(
				dialog.getByText("Google Work", { exact: true }),
			).toBeVisible();
			await dialog.getByText("Google Work", { exact: true }).click();
			await dialog
				.getByRole("button", { name: "Import 1 Calendar", exact: true })
				.click();
			await expect(dialog).toHaveCount(0);
			expect(
				(
					await db.query(
						'SELECT "remoteId" FROM "Calendar" WHERE "userId" = $1',
						[id],
					)
				).rows,
			).toEqual([{ remoteId: "mock-work" }]);
			const stored = (
				await db.query(
					'SELECT credentials FROM "Connection" WHERE "userId" = $1',
					[id],
				)
			).rows[0].credentials;
			expect(stored).not.toContain("mock-google-access");
			expect(page.url()).not.toContain("mock-google-code");
		} finally {
			await db.query('DELETE FROM "Calendar" WHERE "userId" = $1', [id]);
			await db.query('DELETE FROM "User" WHERE id = $1', [id]);
			await db.end();
		}
	});
}
