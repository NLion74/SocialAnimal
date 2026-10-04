import { test, expect } from "./fixtures";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";

const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

test("password recovery, admin email action, and mobile reset feedback", async ({
	page,
	request,
}) => {
	const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
	await db.connect();
	const email = `recovery-${randomUUID()}@example.test`;
	const password = "original-browser-password";
	let id: string | undefined;

	try {
		const registration = await request.post("/api/v1/auth/registrations", {
			data: { email, password },
		});

		expect(registration.status()).toBe(201);
		id = (await registration.json()).id;

		await db.query(
			'UPDATE "User" SET "isAdmin" = true, "accountRole" = $1 WHERE id = $2',
			["admin", id],
		);

		await page.goto("/login");
		await page.getByRole("link", { name: "Forgot password?" }).click();
		await page.getByLabel("Email", { exact: true }).fill(email);
		await page.getByRole("button", { name: "Send reset link" }).click();

		await expect(page.getByRole("status")).toContainText(
			"Request received",
		);

		const token = randomBytes(32).toString("base64url");

		await db.query(
			'INSERT INTO "PasswordReset" (id, "userId", email, "tokenHash", "authVersion", "expiresAt") VALUES ($1, $2, $3, $4, 0, NOW() + INTERVAL \'30 minutes\')',
			[
				randomUUID(),
				id,
				email,
				createHash("sha256").update(token).digest("hex"),
			],
		);

		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/reset-password#${token}`);
		await expect(page).toHaveURL(/\/reset-password$/);

		await page
			.getByLabel("New password", { exact: true })
			.fill("new-browser-password");

		await page
			.getByLabel("Confirm new password", { exact: true })
			.fill("different-password");

		await page
			.getByRole("button", { name: "Change password", exact: true })
			.click();

		await expect(page.locator("form").getByRole("alert")).toContainText(
			"Passwords do not match",
		);

		await expect(page.locator("form").getByRole("alert")).toBeInViewport();

		await page
			.getByLabel("Confirm new password", { exact: true })
			.fill("new-browser-password");

		await page
			.getByRole("button", { name: "Change password", exact: true })
			.click();

		await expect(page.getByRole("status")).toContainText(
			"Password changed",
		);

		await page.screenshot({
			path: "/tmp/socialanimal-style-review/reset-mobile.png",
			fullPage: true,
		});

		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);

		await page.goto(`/reset-password#${token}`);

		await page
			.getByLabel("New password", { exact: true })
			.fill("another-password");

		await page
			.getByLabel("Confirm new password", { exact: true })
			.fill("another-password");

		await page
			.getByRole("button", { name: "Change password", exact: true })
			.click();

		await expect(page.locator("form").getByRole("alert")).toContainText(
			"invalid or expired",
		);

		await page.goto("/login");
		await page.getByLabel("Email", { exact: true }).fill(email);

		await page
			.getByLabel("Password", { exact: true })
			.fill("new-browser-password");

		await page
			.getByRole("button", { name: "Sign In", exact: true })
			.click();

		await expect(page).toHaveURL(/\/dashboard$/);
		await page.goto("/admin");
		await page.getByLabel("Search users").fill(email);
		await page.getByRole("button", { name: "Search", exact: true }).click();
		await page.getByRole("button", { name: "Manage", exact: true }).click();

		await page
			.getByRole("button", { name: "Send password reset email" })
			.click();

		await expect(
			page.getByRole("dialog").getByRole("status"),
		).toContainText("Reset requested");
	} finally {
		if (id) await db.query('DELETE FROM "User" WHERE id = $1', [id]);
		await db.end();
	}
});
