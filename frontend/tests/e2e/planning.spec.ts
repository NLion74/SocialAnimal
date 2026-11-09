import { test, expect } from "./fixtures";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

for (const mobile of [false, true]) {
	test(`planning, colors and notifications ${mobile ? "mobile" : "desktop"}`, async ({
		page,
		request,
	}) => {
		if (mobile) await page.setViewportSize({ width: 375, height: 812 });
		const email = `planning-${randomUUID()}@example.test`;
		const password = "test-planning-password";
		const registered = await request.post("/api/v1/auth/registrations", {
			data: { email, password },
		});
		expect(registered.status()).toBe(201);
		const userId = (await registered.json()).id;
		const db = new Client({
			connectionString: process.env.TEST_DATABASE_URL,
		});
		await db.connect();
		const friend = randomUUID(),
			ownCalendar = randomUUID(),
			reminderCalendar = randomUUID(),
			sharedCalendar = randomUUID();
		const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

		try {
			await db.query(
				'INSERT INTO "User" (id, email, name, "passwordHash", "emailVerifiedAt") VALUES ($1, $2, $3, $4, NOW())',
				[friend, `${friend}@example.test`, "Paul", "unused"],
			);
			await db.query(
				'INSERT INTO "Friendship" (id, "user1Id", "user2Id", status, "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
				[randomUUID(), friend, userId, "accepted"],
			);
			for (const [id, owner, name] of [
				[ownCalendar, userId, "My plans"],
				[reminderCalendar, userId, "Reminders"],
				[sharedCalendar, friend, "Paul’s plans"],
			])
				await db.query(
					'INSERT INTO "Calendar" (id, "userId", name, type, "syncInterval", "lastSuccess", "coverageStart", "coverageEnd", "updatedAt") VALUES ($1, $2, $3, $4, 0, NOW(), NOW() - INTERVAL \'1 day\', NOW() + INTERVAL \'30 days\', NOW())',
					[id, owner, name, "ics"],
				);
			const ruleset = randomUUID();
			await db.query(
				'INSERT INTO "PermissionRuleset" (id, "userId", name, fallback, "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
				[ruleset, friend, "Highlighted plans", "highlight"],
			);
			await db.query(
				'INSERT INTO "CalendarShare" (id, "calendarId", "sharedWithId", "rulesetId") VALUES ($1, $2, $3, $4)',
				[randomUUID(), sharedCalendar, userId, ruleset],
			);
			await db.query(
				'INSERT INTO "Event" (id, "calendarId", title, "startTime", "endTime", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW())',
				[
					randomUUID(),
					sharedCalendar,
					"Coffee with Paul",
					`${day}T11:00:00Z`,
					`${day}T12:00:00Z`,
				],
			);
			await db.query(
				'INSERT INTO "Event" (id, "calendarId", title, "startTime", "endTime", "allDay", "updatedAt") VALUES ($1, $2, $3, NOW() - INTERVAL \'30 days\', NOW() + INTERVAL \'60 days\', true, NOW())',
				[randomUUID(), reminderCalendar, "Term dates"],
			);
			await page.goto("/login");
			await page.getByLabel("Email", { exact: true }).fill(email);
			await page.getByLabel("Password", { exact: true }).fill(password);
			await page
				.getByRole("button", { name: "Sign In", exact: true })
				.click();
			await expect(page).toHaveURL(/dashboard/);
			await expect(
				page.getByRole("heading", { name: /Needs attention/ }),
			).toBeVisible();
			await expect(
				page.getByRole("link", { name: "Verify your email address" }),
			).toBeVisible();
			await page.getByRole("link", { name: /^Calendar/ }).click();
			await page.getByRole("button", { name: "Find a time" }).click();
			await page.getByRole("checkbox", { name: "Paul" }).check();
			await expect(
				page.getByRole("checkbox", { name: "My plans", exact: true }),
			).toBeChecked();
			await expect(
				page.getByRole("checkbox", { name: "Reminders", exact: true }),
			).toBeChecked();
			await page.screenshot({
				path: `/tmp/socialanimal-planning-choices-${mobile ? "mobile" : "desktop"}.png`,
				fullPage: true,
			});
			await page
				.getByRole("button", { name: "Clear", exact: true })
				.click();
			await expect(
				page.getByText(
					"Only your friends’ calendars will be checked. Your own availability won’t be included.",
				),
			).toBeVisible();
			await page
				.getByRole("button", { name: "Select all", exact: true })
				.click();
			if (mobile) {
				await page.emulateMedia({ reducedMotion: "reduce" });
				await page.setViewportSize({ width: 812, height: 375 });
				const largeText = await page.addStyleTag({
					content: "html { font-size: 125% !important; }",
				});
				await expect(
					page.getByRole("button", { name: "Choose times" }),
				).toBeInViewport();
				await largeText.evaluate((element) =>
					element.parentNode?.removeChild(element),
				);
				await page.setViewportSize({ width: 375, height: 812 });
			}
			await page.getByRole("button", { name: "Choose times" }).click();
			await page.getByLabel("From date").fill(day);
			await page.getByLabel("Through date").fill(day);
			await page
				.getByRole("button", { name: "Show suggested times" })
				.click();
			await expect(
				page.getByRole("heading", { name: "Suggested times" }),
			).toBeVisible();
			await expect(
				page.getByText(/All-day events are blocking time/),
			).toBeVisible();
			await expect(
				page.getByRole("button", { name: /View day/ }),
			).toHaveCount(0);
			await page.getByRole("button", { name: "Edit search" }).click();
			await page
				.getByRole("checkbox", { name: "Count all-day events as busy" })
				.uncheck();
			await page
				.getByRole("button", { name: "Show suggested times" })
				.click();
			await expect(
				page.getByText(
					"All-day events are excluded from these suggestions.",
				),
			).toBeVisible();
			await expect(
				page.getByRole("button", { name: /View day/ }).first(),
			).toBeVisible();
			await page.getByRole("button", { name: "Edit search" }).click();
			await page
				.getByRole("button", { name: "Back", exact: true })
				.click();
			await page
				.getByRole("checkbox", { name: "Reminders", exact: true })
				.uncheck();
			await page.getByRole("button", { name: "Choose times" }).click();
			await page
				.getByRole("checkbox", { name: "Count all-day events as busy" })
				.check();
			const searchRequest = page.waitForRequest(
				(request) =>
					request.url().includes("/availability/searches") &&
					request.method() === "POST",
			);
			await page
				.getByRole("button", { name: "Show suggested times" })
				.click();
			expect((await searchRequest).postDataJSON().calendarIds).toEqual([
				ownCalendar,
			]);
			await expect(
				page.getByRole("button", { name: /View day/ }).first(),
			).toBeVisible();
			await page.screenshot({
				path: `/tmp/socialanimal-find-time-${mobile ? "mobile" : "desktop"}.png`,
				fullPage: true,
			});
			await page
				.getByRole("button", { name: /View day/ })
				.first()
				.click();
			await expect(
				page.getByLabel("Highlighted for you").first(),
			).toBeVisible();
			await page
				.getByRole("button", { name: "Colors", exact: true })
				.click();
			await page
				.getByRole("combobox", { name: "Calendar", exact: true })
				.selectOption(sharedCalendar);
			await page
				.getByRole("button", { name: "Rose", exact: true })
				.click();
			await expect(
				page.getByText("Your calendar color is saved."),
			).toBeVisible();
			await expect(
				page.getByRole("button", { name: "Rose", exact: true }),
			).toHaveAttribute("aria-pressed", "true");
			await page.getByRole("button", { name: /close/i }).last().click();
			await page.screenshot({
				path: `/tmp/socialanimal-calendar-${mobile ? "mobile" : "desktop"}.png`,
				fullPage: true,
			});
			await page.getByRole("link", { name: /^Profile/ }).click();
			await expect(
				page.getByRole("heading", { name: "Email notifications" }),
			).toBeVisible();
			const toggle = page.getByRole("checkbox", {
				name: "Events highlighted for you",
			});
			await expect(toggle).not.toBeChecked();
			await toggle.check();
			await page
				.getByRole("button", { name: "Save email preferences" })
				.click();
			await expect(
				page.getByText("Notification settings saved"),
			).toBeVisible();
			await expect(page.locator("body")).toHaveJSProperty(
				"scrollWidth",
				await page.evaluate(() => window.innerWidth),
			);
			await page.goto("/friends");
			await page.getByRole("button", { name: /^Paul/ }).click();
			await expect(
				page.getByRole("button", {
					name: "Remove friend",
					exact: true,
				}),
			).toBeInViewport();
			await expect(
				page.getByRole("region", { name: "Shared with you" }),
			).toContainText("Paul’s plans");
			await page.screenshot({
				path: `/tmp/socialanimal-friend-detail-${mobile ? "mobile" : "desktop"}.png`,
				fullPage: true,
			});
			await page
				.getByRole("button", { name: "Remove friend", exact: true })
				.click();
			const confirmation = page.getByRole("dialog", {
				name: "Remove friend",
				exact: true,
			});
			await expect(confirmation).toContainText(
				"Calendar sharing between you will end in both directions",
			);
			await confirmation
				.getByRole("button", { name: "Keep friend" })
				.click();
			await expect(confirmation).not.toBeVisible();
			await page
				.getByRole("button", { name: "Remove friend", exact: true })
				.click();
			await page.route("**/api/v1/friendships/*", async (route) => {
				if (route.request().method() === "DELETE")
					await route.fulfill({
						status: 503,
						json: {
							code: "UNAVAILABLE",
							message: "Please try again.",
							requestId: "test",
						},
					});
				else await route.continue();
			});
			await confirmation
				.getByRole("button", { name: "Remove friend", exact: true })
				.click();
			await expect(confirmation.getByRole("alert")).toContainText(
				"Friendship was not changed",
			);
			await page.unroute("**/api/v1/friendships/*");
			await confirmation
				.getByRole("button", { name: "Remove friend", exact: true })
				.click();
			await expect(
				page.getByText(
					"Friend removed. Calendar sharing between you has ended.",
				),
			).toBeVisible();
			expect(
				(
					await db.query(
						'SELECT count(*) FROM "CalendarShare" WHERE "calendarId" = $1 AND "sharedWithId" = $2',
						[sharedCalendar, userId],
					)
				).rows[0].count,
			).toBe("0");
		} finally {
			await db.query(
				'DELETE FROM "Calendar" WHERE "userId" = ANY($1::text[])',
				[[userId, friend]],
			);
			await db.query('DELETE FROM "User" WHERE id = ANY($1::text[])', [
				[userId, friend],
			]);
			await db.end();
		}
	});
}
