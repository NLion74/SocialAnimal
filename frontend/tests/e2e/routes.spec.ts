import { test, expect } from "./fixtures";

test("anonymous and authenticated routes, login, subscriptions, credential masking and session errors", async ({
	page,
	request,
	browser,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	for (const path of ["/", "/login", "/register", "/verify-email"]) {
		await page.goto(path);

		await expect(page.locator("body")).not.toContainText(
			"Application error",
		);

		for (const width of [1280, 390]) {
			await page.setViewportSize({ width, height: 844 });

			await page.screenshot({
				path: `/tmp/socialanimal-route-${path.slice(1) || "home"}-${width}.png`,
				fullPage: true,
			});

			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true);
		}

		await page.setViewportSize({ width: 1280, height: 844 });
	}

	for (const path of [
		"/dashboard",
		"/calendar",
		"/friends",
		"/profile",
		"/admin",
	]) {
		await page.goto(path);
		await expect(page).toHaveURL(/\/login$/);
	}

	const email = `browser-${Date.now()}@example.test`,
		password = "browser-password";

	const registration = await request.post("/api/v1/auth/registrations", {
		data: { email, password, name: "Browser User" },
	});

	expect(registration.status()).toBe(201);
	await page.goto("/login");
	await page.locator("input[type=email]").fill(email);
	await page.locator("input[type=password]").fill(password);
	await page.getByRole("button", { name: "Sign In", exact: true }).click();
	await expect(page).toHaveURL(/\/dashboard$/);

	for (const path of [
		"/dashboard",
		"/calendar",
		"/friends",
		"/profile",
		"/admin",
	]) {
		await page.goto(path);

		await expect(
			page.getByRole("button", { name: "Sign out" }),
		).toBeVisible();

		await expect(page.locator("body")).not.toContainText(
			"Application error",
		);

		for (const width of [1280, 390]) {
			await page.setViewportSize({ width, height: 844 });

			await page.screenshot({
				path: `/tmp/socialanimal-route-${path.slice(1) || "home"}-${width}.png`,
				fullPage: true,
			});

			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true);
		}

		await page.setViewportSize({ width: 1280, height: 844 });
	}

	await page.goto("/dashboard");

	await page
		.getByRole("button", { name: "Import Calendar", exact: true })
		.click();

	await page
		.getByRole("button", { name: /Apple Calendar \(iCloud\)/ })
		.click();

	await page.getByPlaceholder("you@icloud.com").fill("apple@example.test");

	await page
		.locator("input[type=password]")
		.fill("app-specific-test-password");

	await page.route("**/api/v1/connections/*/discoveries*", (route) =>
		route.fulfill({
			json: {
				items: [
					{
						id: "apple-work",
						remoteId: "apple-work",
						name: "Apple Work",
						importedCalendarId: null,
					},
				],
				nextCursor: null,
			},
		}),
	);

	await page
		.getByRole("button", { name: "Add Calendar", exact: true })
		.click();

	await expect(page.getByText("Apple Work", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await page.unroute("**/api/v1/connections/*/discoveries*");

	const token = await page.evaluate(() => localStorage.getItem("token"));
	const headers = { authorization: `Bearer ${token}` };

	const connection = await request.post("/api/v1/connections", {
		headers,
		data: {
			type: "ics",
			name: "Browser connection",
			credentials: {
				url: "http://127.0.0.1:4401",
				password: "never-display-this",
			},
		},
	});

	expect(connection.status()).toBe(201);

	const imported = await request.post("/api/v1/calendar-imports", {
		headers,
		data: {
			connectionId: (await connection.json()).id,
			remoteId: "feed",
			name: "Browser Calendar",
			syncInterval: 0,
		},
	});

	expect(imported.status()).toBe(201);
	await page.goto("/dashboard");

	await expect(
		page.getByText("Browser Calendar", { exact: true }),
	).toBeVisible();

	await page.getByTitle("Edit calendar", { exact: true }).click();
	await expect(page.locator("input[type=password]")).toHaveValue("");

	await expect(
		page.getByText(/Credentials are saved on the server/),
	).toBeVisible();

	await page.getByRole("button", { name: "Cancel", exact: true }).click();
	await page.getByTitle("Sync Calendar", { exact: true }).click();

	await expect(page.getByTitle("Sync Calendar", { exact: true })).toBeEnabled(
		{ timeout: 45000 },
	);

	await page.getByTitle("Share calendar").click();
	await page.getByRole("button", { name: "Create subscription" }).click();

	await expect(
		page.getByLabel("Subscription URL", { exact: true }),
	).toHaveValue(/\/feeds\/.+\.ics$/);

	await expect(page.getByRole("dialog")).toBeVisible();

	await expect(
		page.getByRole("dialog").getByRole("heading", { level: 2 }),
	).toHaveCount(1);

	await page.screenshot({
		path: "/tmp/socialanimal-sharing-desktop.png",
		fullPage: true,
	});

	await page.setViewportSize({ width: 390, height: 844 });

	await page.screenshot({
		path: "/tmp/socialanimal-sharing-mobile.png",
		fullPage: true,
	});

	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);

	const previewUrl = await page
		.getByLabel("Preview URL", { exact: true })
		.inputValue();

	const guest = await browser.newContext();
	const guestPage = await guest.newPage();
	await guestPage.goto(previewUrl);

	await expect(
		guestPage.getByRole("heading", {
			name: "Shared calendar",
			exact: true,
		}),
	).toBeVisible();

	expect(
		await guestPage.evaluate(() => localStorage.getItem("token")),
	).toBeNull();

	await guestPage.screenshot({
		path: "/tmp/socialanimal-preview.png",
		fullPage: true,
	});

	const url = await page
		.getByLabel("Subscription URL", { exact: true })
		.inputValue();

	expect((await request.get(url)).status()).toBe(200);

	await page
		.getByRole("button", { name: "Replace URL", exact: true })
		.click();

	await expect(
		page.getByLabel("Subscription URL", { exact: true }),
	).not.toHaveValue(url);

	await expect.poll(async () => (await request.get(url)).status()).toBe(404);
	await guestPage.reload();

	await expect(
		guestPage
			.getByRole("region", { name: "Shared calendar preview" })
			.getByRole("alert"),
	).toContainText("no longer available");

	await guest.close();
	await page.getByRole("button", { name: "Revoke", exact: true }).click();

	await expect(
		page.getByRole("button", { name: "Revoke", exact: true }),
	).toHaveCount(0);

	const deleteButtons = page.getByRole("button", {
		name: "Delete permanently",
		exact: true,
	});

	const revokedCount = await deleteButtons.count();
	page.once("dialog", (dialog) => dialog.accept());
	await deleteButtons.first().click();
	await expect(deleteButtons).toHaveCount(revokedCount - 1);

	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto("/profile");

	await page.route("**/api/v1/me", (route) =>
		route.request().method() === "PATCH"
			? route.fulfill({
					status: 403,
					json: {
						code: "FORBIDDEN",
						message: "Test permission denial",
						requestId: "test",
					},
				})
			: route.continue(),
	);

	await page.getByRole("button", { name: /Save Profile/i }).click();
	await expect(page.getByText("Test permission denial")).toBeVisible();

	expect(await page.evaluate(() => localStorage.getItem("token"))).toBe(
		token,
	);

	await page.unroute("**/api/v1/me");

	await page.evaluate(() => {
		localStorage.setItem("token", "invalid");
		window.dispatchEvent(new Event("session:changed"));
	});

	await expect(page).toHaveURL(/\/login$/);
	expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
	expect(errors).toEqual([]);
});
