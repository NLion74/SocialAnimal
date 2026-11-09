import { test, expect } from "./fixtures";
import { createRequire } from "node:module";
import { randomBytes, createHash } from "node:crypto";

const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

test("ruleset editor, share preview, admin roles, verification, and mobile layout", async ({
	page,
	request,
	browser,
}) => {
	test.setTimeout(90000);
	const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
	await db.connect();
	const suffix = Date.now();

	const email = `admin-browser-${suffix}@example.test`,
		friendEmail = `friend-browser-${suffix}@example.test`;

	const password = "browser-password";
	const ids: string[] = [];
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	try {
		for (const address of [email, friendEmail]) {
			const registered = await request.post(
				"/api/v1/auth/registrations",
				{
					data: {
						email: address,
						password,
						name:
							address === email
								? "Browser Admin"
								: "Browser Friend",
					},
				},
			);

			expect(registered.status()).toBe(201);
			ids.push((await registered.json()).id);
		}

		await db.query(
			'UPDATE "User" SET "isAdmin" = true, "accountRole" = $1 WHERE id = $2',
			["admin", ids[0]],
		);

		const login = await request.post("/api/v1/auth/sessions", {
			data: { email, password },
		});

		const headers = {
			authorization: `Bearer ${(await login.json()).token}`,
		};

		const friendLogin = await request.post("/api/v1/auth/sessions", {
			data: { email: friendEmail, password },
		});

		const friendToken = (await friendLogin.json()).token;

		const invitation = await request.post("/api/v1/friendships", {
			headers,
			data: { targetUserId: ids[1] },
		});

		expect(invitation.status()).toBe(201);

		await request.patch(
			`/api/v1/friendships/${(await invitation.json()).id}`,
			{
				headers: { authorization: `Bearer ${friendToken}` },
				data: { status: "accepted" },
			},
		);

		const connection = await request.post("/api/v1/connections", {
			headers,
			data: {
				type: "ics",
				name: "ABAC test",
				credentials: { url: "http://127.0.0.1:4401" },
			},
		});

		const imported = await request.post("/api/v1/calendar-imports", {
			headers,
			data: {
				connectionId: (await connection.json()).id,
				remoteId: "abac",
				name: "Planning calendar",
				syncInterval: 0,
			},
		});

		expect(imported.status()).toBe(201);
		const calendarId = (await imported.json()).id;
		const second = await request.post("/api/v1/calendar-imports", {
			headers,
			data: {
				connectionId: (await connection.json()).id,
				remoteId: "weekend",
				name: "Weekend calendar",
				syncInterval: 0,
			},
		});
		expect(second.status()).toBe(201);

		const monday = new Date();

		monday.setUTCDate(
			monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7),
		);

		monday.setUTCHours(12, 30, 0, 0);

		await db.query(
			'INSERT INTO "Event" (id, "calendarId", title, description, "startTime", "endTime", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
			[
				`browser-event-${suffix}`,
				calendarId,
				"Planning",
				"Private discussion",
				monday,
				new Date(+monday + 3600000),
			],
		);

		await page.goto("/login");
		await page.locator("input[type=email]").fill(email);
		await page.locator("input[type=password]").fill(password);

		await page
			.getByRole("button", { name: "Sign In", exact: true })
			.click();

		await expect(
			page.getByRole("link", { name: "Admin", exact: true }),
		).toBeVisible();

		await page.goto("/friends");
		await page.getByRole("button", { name: /Browser Friend/ }).click();
		await page
			.getByRole("button", { name: /Planning calendar Not shared/ })
			.click();

		await page
			.getByRole("button", { name: "Add ruleset", exact: true })
			.click();

		const editor = page.getByRole("region", {
			name: "Add ruleset",
			exact: true,
		});

		await editor.getByLabel("Name", { exact: true }).fill("Monday privacy");

		await editor
			.getByRole("button", { name: "Add exception", exact: true })
			.click();
		await editor.getByLabel("Add a filter").selectOption("days");
		await editor
			.getByRole("button", { name: "monday", exact: true })
			.click();
		await expect(
			editor.getByRole("combobox", { name: "Attribute" }),
		).toHaveCount(0);
		await editor
			.getByRole("button", { name: "Done with exception" })
			.click();
		await expect(editor).toContainText("Monday");
		await editor
			.getByRole("button", { name: "Expert", exact: true })
			.click();
		await editor
			.getByRole("button", { name: "Add condition", exact: true })
			.click();

		await editor
			.getByRole("combobox", { name: "Attribute", exact: true })
			.nth(1)
			.selectOption("event.title");

		await editor
			.getByRole("combobox", { name: "Operator", exact: true })
			.nth(1)
			.selectOption("contains");

		await editor
			.getByRole("textbox", { name: "Value", exact: true })
			.fill("Secret");

		await editor
			.getByText("Condition options", { exact: true })
			.nth(1)
			.click();

		await editor
			.getByRole("button", { name: "Invert (NOT)", exact: true })
			.click();

		await expect(
			editor.getByText("Except when", { exact: true }),
		).toBeVisible();

		await expect(
			editor.getByRole("button", { name: "Basic", exact: true }),
		).toBeDisabled();

		await editor
			.getByRole("button", { name: "Add nested group", exact: true })
			.click();

		await expect(
			editor.getByRole("combobox", { name: "Match conditions" }).nth(1),
		).toHaveValue("any");

		await editor
			.getByRole("button", { name: "Remove condition 3", exact: true })
			.click();

		await expect(
			editor.getByRole("combobox", { name: "Match conditions" }),
		).toHaveCount(1);

		await editor
			.getByRole("combobox", { name: "Default visibility" })
			.selectOption("hidden");

		await page.setViewportSize({ width: 1440, height: 1000 });

		await editor
			.getByLabel("Name", { exact: true })
			.scrollIntoViewIfNeeded();

		await page.screenshot({
			path: "/tmp/socialanimal-ruleset-desktop.png",
			fullPage: true,
		});

		await page.setViewportSize({ width: 390, height: 844 });

		await page.screenshot({
			path: "/tmp/socialanimal-ruleset-mobile.png",
			fullPage: true,
		});

		await editor
			.getByText("Except when", { exact: true })
			.scrollIntoViewIfNeeded();

		await page.screenshot({
			path: "/tmp/socialanimal-ruleset-mobile-nested.png",
			fullPage: true,
		});

		expect(
			await editor
				.locator("form")
				.evaluate((form) => form.scrollWidth <= form.clientWidth),
		).toBe(true);

		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);

		await page.setViewportSize({ width: 320, height: 740 });
		expect(
			await editor
				.locator("form")
				.evaluate((form) => form.scrollWidth <= form.clientWidth),
		).toBe(true);
		await page.setViewportSize({ width: 390, height: 844 });

		await editor.getByRole("button", { name: "Save ruleset" }).click();
		await expect(editor).toHaveCount(0);

		const sharing = page.getByRole("region", {
			name: "Planning calendar",
			exact: true,
		});

		await expect(
			sharing
				.getByRole("combobox", { name: "Ruleset", exact: true })
				.locator("option:checked"),
		).toHaveText("Monday privacy");
		await sharing.getByLabel("Planning calendar").check();
		await expect(
			sharing.getByText("Unsaved changes", { exact: true }),
		).toBeVisible();
		const grantUrl = `**/api/v1/calendars/${calendarId}/grants/${ids[1]}`;
		await page.route(grantUrl, (route) =>
			route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({
					code: "TEST_ERROR",
					message: "Please try again.",
					requestId: "test",
				}),
			}),
		);
		await sharing
			.getByRole("button", { name: "Share calendar", exact: true })
			.click();
		await expect(sharing.getByRole("alert")).toContainText(
			"Sharing was not changed",
		);
		await expect(sharing.getByLabel("Planning calendar")).toBeChecked();
		await page.unroute(grantUrl);
		await sharing
			.getByRole("button", { name: "Share calendar", exact: true })
			.click();
		await expect(
			sharing.getByText("Sharing saved.", { exact: true }),
		).toBeVisible();
		await page.screenshot({
			path: "/tmp/socialanimal-friend-sharing-mobile.png",
			fullPage: true,
		});
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.screenshot({
			path: "/tmp/socialanimal-friend-sharing-desktop.png",
			fullPage: true,
		});
		await page.setViewportSize({ width: 390, height: 844 });

		await sharing
			.getByRole("button", { name: "Preview", exact: true })
			.click();

		const preview = page.getByRole("region", {
			name: "What your friend sees",
		});

		await preview
			.getByRole("button", { name: "Show preview", exact: true })
			.click();

		await expect(
			preview.getByText("Private discussion", { exact: true }),
		).toBeVisible();

		await expect(preview.getByText("Why this visibility?")).toHaveCount(0);
		await expect(preview).toContainText("Rule 1 matched");
		await expect(preview).toContainText("Day of week is exactly");

		await page.screenshot({
			path: "/tmp/socialanimal-preview-mobile.png",
			fullPage: true,
		});

		await page.setViewportSize({ width: 1440, height: 1000 });

		await page.screenshot({
			path: "/tmp/socialanimal-preview-desktop.png",
			fullPage: true,
		});

		await preview
			.getByRole("button", { name: "Calendar", exact: true })
			.click();

		await expect(preview).not.toContainText("Private discussion");

		await preview
			.getByRole("button", { name: "List", exact: true })
			.click();

		await preview
			.getByRole("button", { name: "← Back", exact: true })
			.click();

		await sharing
			.getByRole("combobox", { name: "Ruleset", exact: true })
			.selectOption({ label: "Full details" });
		await sharing
			.getByRole("button", { name: "Save changes", exact: true })
			.click();
		await expect(
			sharing.getByText("Sharing saved.", { exact: true }),
		).toBeVisible();

		await sharing
			.getByRole("combobox", { name: "Ruleset", exact: true })
			.selectOption({ label: "Busy only" });
		page.once("dialog", async (dialog) => {
			expect(dialog.message()).toBe("Discard unsaved sharing changes?");
			await dialog.dismiss();
		});
		await sharing
			.getByRole("button", { name: "← Back", exact: true })
			.click();
		await page
			.getByRole("region", { name: "Browser Friend", exact: true })
			.getByRole("button", { name: "← Back", exact: true })
			.click();
		await page.getByRole("button", { name: /Planning calendar/ }).click();
		await expect(sharing).toBeVisible();
		await sharing
			.getByRole("combobox", { name: "Ruleset", exact: true })
			.selectOption({ label: "Full details" });

		await sharing
			.getByRole("button", { name: "Preview", exact: true })
			.click();

		await preview
			.getByRole("button", { name: "Show preview", exact: true })
			.click();

		await expect(preview).toContainText("Default visibility");
		await expect(preview.getByText("Why this visibility?")).toHaveCount(0);
		await preview
			.getByRole("button", { name: "← Back", exact: true })
			.click();
		await sharing
			.getByRole("button", { name: "← Back", exact: true })
			.click();
		await page.getByRole("button", { name: /Weekend calendar/ }).click();
		const weekend = page.getByRole("region", {
			name: "Weekend calendar",
			exact: true,
		});
		await weekend.getByLabel("Weekend calendar", { exact: true }).check();
		await weekend
			.getByRole("combobox", { name: "Ruleset", exact: true })
			.selectOption({ label: "Busy only" });
		await weekend
			.locator("summary:visible")
			.filter({ hasText: "Set an expiration (optional)" })
			.click();
		await weekend
			.locator("input[type=datetime-local]:visible")
			.fill("2027-12-01T12:00");
		await weekend
			.getByRole("button", { name: "Preview", exact: true })
			.click();
		await preview
			.getByRole("button", { name: "← Back", exact: true })
			.click();
		await expect(
			weekend.locator("input[type=datetime-local]:visible"),
		).toHaveValue("2027-12-01T12:00");
		await weekend
			.getByRole("button", { name: "← Back", exact: true })
			.click();
		await page.getByRole("button", { name: /Planning calendar/ }).click();
		await expect(
			sharing
				.getByRole("combobox", { name: "Ruleset", exact: true })
				.locator("option:checked"),
		).toHaveText("Full details");
		await sharing
			.getByRole("button", { name: "← Back", exact: true })
			.click();
		await page.getByRole("button", { name: /Weekend calendar/ }).click();
		await expect(
			weekend
				.getByRole("combobox", { name: "Ruleset", exact: true })
				.locator("option:checked"),
		).toHaveText("Busy only");
		await weekend
			.getByRole("button", { name: "Share calendar", exact: true })
			.click();
		await expect(
			weekend.getByText("Sharing saved.", { exact: true }),
		).toBeVisible();
		const savedFriends = await request.get("/api/v1/friendships", {
			headers,
		});
		expect(
			(await savedFriends.json()).items[0].sharedCalendarIds,
		).toHaveLength(2);

		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto("/admin");

		await expect(
			page.getByRole("heading", { name: "Instance activity" }),
		).toBeVisible();

		await page.getByRole("button", { name: "Users", exact: false }).click();
		await page.getByLabel("Search users").fill(friendEmail);
		await page.getByRole("button", { name: "Search", exact: true }).click();

		await expect(
			page.getByRole("button", { name: "Manage", exact: true }),
		).toHaveCount(1);

		await page.getByRole("button", { name: "Manage", exact: true }).click();

		await page
			.getByRole("combobox", { name: "Role", exact: true })
			.selectOption("readonly");

		await page
			.getByRole("button", { name: "Save user", exact: true })
			.click();

		await expect(
			page.getByText("Read-only demo", { exact: true }),
		).toBeVisible();

		await page.evaluate(() => window.scrollTo(0, 0));

		await page.screenshot({
			path: "/tmp/socialanimal-admin-desktop.png",
			fullPage: true,
		});

		await page.setViewportSize({ width: 390, height: 844 });

		await page.screenshot({
			path: "/tmp/socialanimal-admin-mobile.png",
			fullPage: true,
		});

		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);

		await page
			.getByRole("link", { name: "Admin", exact: true })
			.scrollIntoViewIfNeeded();
		await expect(
			page.getByRole("link", { name: "Admin", exact: true }),
		).toBeInViewport();
		await page
			.getByRole("button", { name: "← Administration", exact: true })
			.click();
		await page.getByRole("button", { name: "Users", exact: false }).click();
		const manage = page.getByRole("button", {
			name: "Manage",
			exact: true,
		});
		await expect(manage).toBeInViewport();
		await page.screenshot({
			path: "/tmp/socialanimal-admin-users-mobile.png",
			fullPage: false,
		});
		await manage.click();
		await expect(
			page.getByRole("combobox", { name: "Role", exact: true }),
		).toBeVisible();
		await page.keyboard.press("Escape");
		for (const table of await page.locator("table:visible").all()) {
			expect(
				await table.evaluate(
					(element) => element.scrollWidth <= element.clientWidth,
				),
			).toBe(true);
		}

		const denied = await request.patch("/api/v1/me", {
			headers: { authorization: `Bearer ${friendToken}` },
			data: { name: "No change" },
		});

		expect(denied.status()).toBe(403);
		// Verify the anonymous confirmation page using a token placed only in the URL fragment.
		const token = randomBytes(32).toString("base64url");

		await db.query(
			'INSERT INTO "EmailVerification" (id, "userId", email, "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userId") DO UPDATE SET "tokenHash" = EXCLUDED."tokenHash", "expiresAt" = EXCLUDED."expiresAt", "consumedAt" = NULL',
			[
				`browser-verification-${suffix}`,
				ids[0],
				email,
				createHash("sha256").update(token).digest("hex"),
				new Date(Date.now() + 600000),
			],
		);

		const guest = await browser.newContext();
		const guestPage = await guest.newPage();
		await guestPage.goto(`/verify-email#${token}`);
		await expect(guestPage).toHaveURL(/\/verify-email$/);

		await guestPage
			.getByRole("button", { name: "Verify email address" })
			.click();

		await expect(
			guestPage.getByRole("heading", { name: "Email verified" }),
		).toBeVisible();

		await guest.close();
		expect(errors).toEqual([]);
	} finally {
		await db.query('DELETE FROM "Calendar" WHERE "userId" = ANY($1)', [
			ids,
		]);

		await db.query('DELETE FROM "User" WHERE id = ANY($1)', [ids]);
		await db.end();
	}
});
