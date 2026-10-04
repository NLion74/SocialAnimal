import { test, expect } from "./fixtures";
import { createRequire } from "node:module";
import { randomUUID, randomBytes, createHash } from "node:crypto";

const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

test("admin defaults, invitation links, verification refresh, and independent public calendars", async ({
	page,
	request,
	browser,
}) => {
	const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
	await db.connect();

	const previous = (
		await db.query('SELECT * FROM "AppSettings" WHERE id = $1', ["global"])
	).rows[0];

	const email = `admin-${randomUUID()}@example.test`,
		password = "browser-password";

	const ids: string[] = [];
	const contexts: Array<Awaited<ReturnType<typeof browser.newContext>>> = [];

	try {
		const account = await request.post("/api/v1/auth/registrations", {
			data: { email, password },
		});

		expect(account.status()).toBe(201);
		ids.push((await account.json()).id);

		await db.query(
			'UPDATE "User" SET "isAdmin" = true, "accountRole" = $1 WHERE id = $2',
			["admin", ids[0]],
		);

		await page.goto("/login");
		await page.locator("input[type=email]").fill(email);
		await page.locator("input[type=password]").fill(password);

		await page
			.getByRole("button", { name: "Sign In", exact: true })
			.click();

		await expect(page).toHaveURL(/\/dashboard$/);
		await page.goto("/profile");
		await expect(page.getByText("Admin - Registration")).toHaveCount(0);

		await expect(page.getByText("Check verification status")).toHaveCount(
			1,
		);

		await page.goto("/admin");

		await page
			.getByRole("combobox", { name: "Default timezone", exact: true })
			.selectOption("Europe/Berlin");

		await page
			.getByLabel("Default first day of the week")
			.selectOption("sunday");

		await page.getByLabel("Require an invitation", { exact: true }).check();

		await page
			.getByRole("button", { name: "Save settings", exact: true })
			.click();

		await expect(page.getByText("Instance settings saved.")).toBeVisible();
		await page.getByLabel("Invitation label").fill("Browser invitation");

		await page
			.getByRole("button", { name: "Create invitation", exact: true })
			.click();

		const invitation = page.getByRole("listitem").filter({
			has: page.getByText("Browser invitation", { exact: true }),
		});

		const link = await invitation
			.getByLabel("Registration link", { exact: true })
			.inputValue();

		const guest = await browser.newContext();
		contexts.push(guest);
		const guestPage = await guest.newPage();
		await guestPage.goto(link);
		await expect(guestPage).toHaveURL(/\/register$/);

		await expect(
			guestPage.getByText("Invitation supplied.", { exact: false }),
		).toBeVisible();

		await guestPage.reload();

		await expect(
			guestPage.getByText("Invitation supplied.", { exact: false }),
		).toBeVisible();

		await guestPage.getByPlaceholder("Your name").fill("Invited user");
		const invitedEmail = `${randomUUID()}@example.test`;
		await guestPage.locator("input[type=email]").fill(invitedEmail);
		await guestPage.locator("input[type=password]").fill(password);

		await guestPage
			.getByRole("button", { name: "Create Account", exact: true })
			.click();

		await expect(guestPage).toHaveURL(/\/dashboard$/);

		const invited = (
			await db.query('SELECT id FROM "User" WHERE email = $1', [
				invitedEmail,
			])
		).rows[0].id;

		ids.push(invited);

		const preferences = (
			await db.query('SELECT * FROM "UserSettings" WHERE "userId" = $1', [
				invited,
			])
		).rows[0];

		expect(preferences.timezone).toBe("Europe/Berlin");
		expect(preferences.firstDayOfWeek).toBe("sunday");

		await db.query(
			'UPDATE "AppSettings" SET "requireEmailVerification" = true WHERE id = $1',
			["global"],
		);

		await guestPage.goto("/profile");

		await guestPage
			.getByRole("button", { name: "Check verification status" })
			.click();

		await expect(
			guestPage.getByText(/Email is still unverified/),
		).toBeVisible();

		const token = randomBytes(32).toString("base64url");

		await db.query(
			'INSERT INTO "EmailVerification" (id, "userId", email, "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4, $5) ON CONFLICT ("userId") DO UPDATE SET "tokenHash" = EXCLUDED."tokenHash", "expiresAt" = EXCLUDED."expiresAt", "consumedAt" = NULL',
			[
				randomUUID(),
				invited,
				invitedEmail,
				createHash("sha256").update(token).digest("hex"),
				new Date(Date.now() + 600000),
			],
		);

		const verified = await request.post(
			"/api/v1/auth/email-verifications",
			{ data: { token } },
		);

		expect(verified.status()).toBe(200);

		await guestPage
			.getByRole("button", { name: "Check verification status" })
			.click();

		await expect(
			guestPage.getByText("Check verification status"),
		).toHaveCount(0);

		await guestPage.goto("/calendar");

		await expect(
			guestPage.getByRole("button", { name: "Today", exact: true }),
		).toBeVisible();

		await db.query(
			'UPDATE "AppSettings" SET "requireEmailVerification" = false WHERE id = $1',
			["global"],
		);

		const login = await request.post("/api/v1/auth/sessions", {
			data: { email, password },
		});

		const headers = {
			authorization: `Bearer ${(await login.json()).token}`,
		};

		const calendarId = randomUUID();

		await db.query(
			'INSERT INTO "Calendar" (id, "userId", name, type, "syncInterval", "updatedAt") VALUES ($1, $2, $3, $4, 0, NOW())',
			[calendarId, ids[0], "Shared schedule", "ics"],
		);

		const start = new Date();
		start.setDate(15);
		start.setHours(13, 0, 0, 0);

		await db.query(
			'INSERT INTO "Event" (id, "calendarId", title, description, "startTime", "endTime", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
			[
				randomUUID(),
				calendarId,
				"Private planning",
				"Private notes",
				start,
				new Date(+start + 3600000),
			],
		);

		await page.goto("/dashboard");
		await page.getByTitle("Share calendar", { exact: true }).click();

		const dialog = page.getByRole("dialog", {
			name: "Shared schedule",
			exact: true,
		});

		await dialog
			.getByLabel("Link name", { exact: true })
			.fill("Busy audience");

		await dialog
			.getByRole("combobox", { name: "Ruleset", exact: true })
			.selectOption({ label: "Busy only" });

		await dialog
			.getByRole("button", { name: "Create subscription", exact: true })
			.click();

		const busyUrl = await dialog
			.getByLabel("Preview URL", { exact: true })
			.inputValue();

		await dialog
			.getByLabel("Link name", { exact: true })
			.fill("Full audience");

		await dialog
			.getByRole("combobox", { name: "Ruleset", exact: true })
			.selectOption({ label: "Full details" });

		await dialog
			.getByRole("button", { name: "Create subscription", exact: true })
			.click();

		await expect(
			dialog.getByLabel("Preview URL", { exact: true }),
		).toHaveCount(2);

		const fullUrl = await dialog
			.getByLabel("Preview URL", { exact: true })
			.nth(1)
			.inputValue();

		const publicContext = await browser.newContext();
		contexts.push(publicContext);
		const publicPage = await publicContext.newPage();
		await publicPage.goto(busyUrl);

		await expect(
			publicPage.getByTitle("Busy", { exact: true }),
		).toBeVisible();

		await expect(
			publicPage.getByTitle("Private planning", { exact: true }),
		).toHaveCount(0);

		await publicPage
			.getByRole("button", { name: "week", exact: true })
			.click();

		await publicPage
			.getByRole("button", { name: "day", exact: true })
			.click();

		await publicPage
			.getByRole("button", { name: "month", exact: true })
			.click();

		await publicPage.setViewportSize({ width: 390, height: 844 });

		await publicPage.screenshot({
			path: "/tmp/socialanimal-public-calendar-mobile.png",
			fullPage: true,
		});

		await publicPage.goto(fullUrl);

		await publicPage
			.getByTitle("Private planning", { exact: true })
			.click();

		await publicPage
			.getByTitle("Private planning", { exact: true })
			.click();

		await expect(publicPage.getByRole("dialog")).toContainText(
			"Private notes",
		);

		const links = await (
			await request.get(`/api/v1/calendars/${calendarId}/subscriptions`, {
				headers,
			})
		).json();

		await request.delete(
			`/api/v1/subscriptions/${links.items.find((item: { name: string }) => item.name === "Busy audience").id}`,
			{ headers },
		);

		await publicPage.goto(busyUrl);

		await expect(
			publicPage
				.getByRole("region", { name: "Shared calendar preview" })
				.getByRole("alert"),
		).toContainText("no longer available");

		await publicPage.goto(fullUrl);

		await expect(
			publicPage.getByTitle("Private planning", { exact: true }),
		).toBeVisible();

		await page.keyboard.press("Escape");
		await page.goto("/admin");

		await page
			.getByRole("button", { name: "Clear all sync logs", exact: true })
			.click();

		await page
			.getByRole("button", {
				name: "Clear history and errors",
				exact: true,
			})
			.click();

		await expect(
			page.getByRole("status").filter({ hasText: /Cleared .* logs/ }),
		).toBeVisible();
	} finally {
		for (const context of contexts) await context.close();

		await db.query('DELETE FROM "Calendar" WHERE "userId" = ANY($1)', [
			ids,
		]);

		await db.query('DELETE FROM "User" WHERE id = ANY($1)', [ids]);

		await db.query('DELETE FROM "InviteCode" WHERE "createdBy" = ANY($1)', [
			ids,
		]);

		await db.query(
			'UPDATE "AppSettings" SET "registrationsOpen" = $1, "inviteOnly" = $2, "requireEmailVerification" = $3, "defaultTimezone" = $4, "defaultFirstDayOfWeek" = $5 WHERE id = $6',
			[
				previous.registrationsOpen,
				previous.inviteOnly,
				previous.requireEmailVerification,
				previous.defaultTimezone,
				previous.defaultFirstDayOfWeek,
				"global",
			],
		);

		await db.end();
	}
});
