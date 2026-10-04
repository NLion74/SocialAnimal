import { test, expect } from "./fixtures";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

const screenshots = "/tmp/socialanimal-style-review";

mkdirSync(screenshots, { recursive: true });

for (const viewport of [
	{ width: 1440, height: 1000 },
	{ width: 390, height: 844 },
]) {
	test(`action feedback stays visible and truthful at ${viewport.width}px`, async ({
		page,
		request,
		context,
	}) => {
		test.setTimeout(90000);
		await page.setViewportSize(viewport);

		await context.addInitScript(() => {
			Object.defineProperty(navigator, "clipboard", {
				configurable: true,
				value: {
					writeText: async () => {
						if (sessionStorage.getItem("test:deny-copy"))
							throw new Error("Clipboard denied");
					},
				},
			});
		});

		const db = new Client({
			connectionString: process.env.TEST_DATABASE_URL,
		});

		await db.connect();
		const email = `style-${randomUUID()}@example.test`;
		const password = "style-test-password";

		const account = await request.post("/api/v1/auth/registrations", {
			data: { email, password },
		});

		expect(account.status()).toBe(201);
		const id = (await account.json()).id;

		await db.query(
			'UPDATE "User" SET "isAdmin" = true, "accountRole" = $1 WHERE id = $2',
			["admin", id],
		);

		const original = (
			await db.query('SELECT * FROM "AppSettings" WHERE id = $1', [
				"global",
			])
		).rows[0];

		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));

		try {
			await page.goto("/login");
			await page.locator("input[type=email]").fill(email);
			await page.locator("input[type=password]").fill("wrong-password");

			await page
				.getByRole("button", { name: "Sign In", exact: true })
				.click();

			await expect(
				page.locator("form").getByRole("alert"),
			).toBeInViewport();

			await page.screenshot({
				path: `${screenshots}/login-error-${viewport.width}.png`,
				fullPage: true,
			});

			await page.locator("input[type=password]").fill(password);

			await page
				.getByRole("button", { name: "Sign In", exact: true })
				.click();

			await expect(page).toHaveURL(/\/dashboard$/);
			await page.goto("/admin");

			const settings = page.locator("section").filter({
				has: page.getByRole("heading", {
					name: "Instance settings",
					exact: true,
				}),
			});

			await settings
				.getByLabel("Sync past days", { exact: true })
				.fill("0");

			await settings
				.getByLabel("Sync future days", { exact: true })
				.fill("0");

			await settings
				.getByRole("button", { name: "Save settings", exact: true })
				.click();

			const failedSave = settings.getByRole("alert");
			await expect(failedSave).toContainText("Settings were not saved");
			await expect(failedSave).toBeInViewport();
			await expect(failedSave).toBeFocused();
			await expect(settings.getByRole("status")).toHaveCount(0);

			await expect(
				settings.getByLabel("Sync future days", { exact: true }),
			).toHaveValue("0");

			await page.screenshot({
				path: `${screenshots}/admin-error-${viewport.width}.png`,
			});

			await settings
				.getByLabel("Sync future days", { exact: true })
				.fill(String(original.syncFutureDays));

			await settings
				.getByLabel("Sync past days", { exact: true })
				.fill(String(original.syncPastDays));

			await settings
				.getByRole("button", { name: "Save settings", exact: true })
				.click();

			await expect(settings.getByRole("status")).toContainText(
				"Instance settings saved.",
			);

			await expect(failedSave).toHaveCount(0);

			await settings
				.getByLabel("Sync future days", { exact: true })
				.fill("366");

			await expect(
				settings.getByText("Unsaved changes", { exact: true }),
			).toBeVisible();

			await expect(settings.getByRole("status")).toHaveCount(0);

			await page
				.getByLabel("Invitation label", { exact: true })
				.fill("Design review invitation");

			await page
				.getByRole("button", { name: "Create invitation", exact: true })
				.click();

			const invitation = page
				.getByRole("listitem")
				.filter({ hasText: "Design review invitation" });

			const copy = invitation.getByRole("button", {
				name: "Copy registration link",
				exact: true,
			});

			await copy.click();

			const copied = invitation
				.getByRole("status")
				.filter({ hasText: "Registration link copied" });

			await expect(copied).toBeInViewport();
			await expect(copy).toHaveText("Copied");
			await expect(copied).toHaveCSS("border-left-width", "3px");

			await invitation.screenshot({
				path: `${screenshots}/invitation-copied-${viewport.width}.png`,
			});

			await page.evaluate(() =>
				sessionStorage.setItem("test:deny-copy", "1"),
			);

			await copy.click();
			await expect(copied).toHaveCount(0);

			await expect(invitation.getByRole("alert")).toContainText(
				"Could not copy",
			);

			await expect(copy).toHaveText("Copy registration link");

			await page.evaluate(() =>
				sessionStorage.removeItem("test:deny-copy"),
			);

			await copy.click();
			await expect(invitation.getByRole("alert")).toHaveCount(0);

			// Check the layouts in each main route at desktop and narrow widths.
			for (const route of [
				"dashboard",
				"calendar",
				"friends",
				"profile",
			]) {
				await page.goto(`/${route}`);

				await expect(
					page.getByRole("button", { name: "Sign out", exact: true }),
				).toBeVisible();

				await expect(
					page.getByText("Loading…", { exact: true }),
				).toHaveCount(0);

				await page.screenshot({
					path: `${screenshots}/${route}-${viewport.width}.png`,
					fullPage: true,
				});

				expect(
					await page.evaluate(
						() =>
							document.documentElement.scrollWidth <= innerWidth,
					),
				).toBe(true);
			}

			await page
				.getByRole("button", { name: "Save Profile", exact: true })
				.click();

			await expect(
				page.getByRole("status").filter({ hasText: "Profile saved!" }),
			).toBeInViewport();

			await page
				.getByRole("button", { name: "Delete Account", exact: true })
				.click();

			await expect(
				page
					.getByRole("alert")
					.filter({ hasText: "Account was not deleted" }),
			).toBeInViewport();

			await page.screenshot({
				path: `${screenshots}/profile-feedback-${viewport.width}.png`,
			});

			await page.goto("/friends");

			await page
				.getByRole("button", { name: "Add Friend", exact: true })
				.click();

			await page
				.getByLabel("Friend's Email", { exact: true })
				.fill("missing@example.test");

			await page
				.getByRole("button", { name: "Send Request", exact: true })
				.click();

			const dialog = page.getByRole("dialog");
			await expect(dialog.getByRole("alert")).toBeInViewport();

			await page.screenshot({
				path: `${screenshots}/friend-error-${viewport.width}.png`,
			});

			await page.keyboard.press("Escape");
			expect(errors).toEqual([]);
		} finally {
			await db.query('DELETE FROM "InviteCode" WHERE "createdBy" = $1', [
				id,
			]);

			await db.query('DELETE FROM "User" WHERE id = $1', [id]);
			await db.end();
		}
	});
}
