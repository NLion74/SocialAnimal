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
		await page.getByRole("button", { name: "Share", exact: true }).click();

		await page
			.getByRole("button", { name: "Add ruleset", exact: true })
			.click();

		const editor = page.getByRole("dialog", {
			name: "Add ruleset",
			exact: true,
		});

		await editor.getByLabel("Name", { exact: true }).fill("Monday privacy");

		await editor
			.getByRole("button", { name: "Add rule", exact: true })
			.click();

		await editor.getByRole("button", { name: "Add AND condition" }).click();
		await editor.getByLabel("Expert mode", { exact: false }).check();

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
			.getByRole("button", { name: "Add NOT", exact: true })
			.nth(1)
			.click();

		await editor
			.getByRole("combobox", { name: "Otherwise, if no rule matches" })
			.selectOption("hidden");

		await page.screenshot({
			path: "/tmp/socialanimal-ruleset-desktop.png",
			fullPage: true,
		});

		await page.setViewportSize({ width: 390, height: 844 });

		await page.screenshot({
			path: "/tmp/socialanimal-ruleset-mobile.png",
			fullPage: true,
		});

		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);

		await editor.getByRole("button", { name: "Save ruleset" }).click();
		await expect(editor).toHaveCount(0);

		const sharing = page.getByRole("dialog", {
			name: "Share with Browser Friend",
			exact: true,
		});

		await sharing
			.getByRole("combobox", { name: "Ruleset", exact: true })
			.selectOption({ label: "Monday privacy" });

		await sharing.getByLabel("Planning calendar").check();

		await sharing
			.getByRole("button", { name: "Preview", exact: true })
			.click();

		const preview = page.getByRole("dialog", {
			name: "What your friend sees",
		});

		await preview
			.getByRole("button", { name: "Show preview", exact: true })
			.click();

		await expect(
			preview.getByText("Private discussion", { exact: true }),
		).toBeVisible();

		await preview.getByText("Why this visibility?").click();
		await expect(preview).toContainText("matched");

		await preview
			.getByRole("button", { name: "Calendar", exact: true })
			.click();

		await expect(preview).not.toContainText("Private discussion");

		await preview
			.getByRole("button", { name: "List", exact: true })
			.click();

		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto("/admin");

		await expect(
			page.getByRole("heading", { name: "Instance activity" }),
		).toBeVisible();

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
