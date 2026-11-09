import { test, expect } from "./fixtures";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

test("main profile preferences and calendar navigation, saved date, source toggles, and event details", async ({
	page,
	request,
}) => {
	const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
	await db.connect();

	const email = `parity-${randomUUID()}@example.test`,
		password = "browser-parity-password";

	const account = await request.post("/api/v1/auth/registrations", {
		data: { email, password },
	});

	expect(account.status()).toBe(201);
	const userId = (await account.json()).id;
	const calendarId = randomUUID();
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));

	try {
		await db.query(
			'INSERT INTO "Calendar" (id, "userId", name, type, "syncInterval", "updatedAt") VALUES ($1, $2, \'Parity calendar\', \'ics\', 0, NOW())',
			[calendarId, userId],
		);

		for (const [title, start, end, allDay] of [
			[
				"Parity planning",
				"2030-05-12T12:00Z",
				"2030-05-12T13:00Z",
				false,
			],
			[
				"Parallel meeting",
				"2030-05-12T12:30Z",
				"2030-05-12T13:30Z",
				false,
			],
			["Weekend trip", "2030-05-12T12:00Z", "2030-05-13T14:00Z", false],
			["All-day holiday", "2030-05-12T00:00Z", "2030-05-13T00:00Z", true],
		]) {
			await db.query(
				'INSERT INTO "Event" (id, "calendarId", "externalId", title, description, location, "startTime", "endTime", "allDay", "updatedAt") VALUES ($1, $2, $1, $3, \'Meeting notes\', \'Meeting room\', $4, $5, $6, NOW())',
				[randomUUID(), calendarId, title, start, end, allDay],
			);
		}

		await page.goto("/login");
		await page.getByLabel("Email", { exact: true }).fill(email);
		await page.getByLabel("Password", { exact: true }).fill(password);

		await page
			.getByRole("button", { name: "Sign In", exact: true })
			.click();

		await expect(page).toHaveURL(/dashboard/);
		await page.goto("/profile");
		await page.getByLabel("Display Name").fill("Parity person");
		await page.getByLabel("Sunday", { exact: true }).check();

		await page
			.getByLabel("Timezone", { exact: true })
			.selectOption("Europe/London");

		await page.getByLabel("Default Tab").selectOption("calendar");
		await page.getByRole("button", { name: "Save Profile" }).click();

		await expect(
			page.getByText("Profile saved!", { exact: true }),
		).toBeVisible();

		await page.goto("/");
		await expect(page).toHaveURL(/calendar/);

		await page.evaluate(() => {
			localStorage.setItem(
				"calendar:date",
				new Date(2030, 4, 12).toISOString(),
			);

			localStorage.setItem("calendar:view", "day");
		});

		await page.reload();

		await expect(
			page.getByTitle("Parity planning", { exact: true }),
		).toBeVisible();

		await expect(
			page.getByText("All-day holiday", { exact: true }),
		).toBeVisible();

		await expect(
			page
				.locator('[class*="allDayEvents"]')
				.getByTitle("Weekend trip", { exact: true }),
		).toBeVisible();
		await expect(
			page
				.locator('[class*="weekBodyScroll"]')
				.getByTitle("Weekend trip", { exact: true }),
		).toHaveCount(0);
		await page.getByTitle("Weekend trip", { exact: true }).click();
		await expect(page.getByRole("dialog")).toContainText("May 12");
		await expect(page.getByRole("dialog")).toContainText("May 13");
		await expect(page.getByRole("dialog")).not.toContainText("All day");
		await page.keyboard.press("Escape");

		await page.getByTitle("Parity planning", { exact: true }).click();
		await expect(page.getByRole("dialog")).toContainText("Meeting notes");
		await expect(page.getByRole("dialog")).toContainText("Meeting room");
		await page.keyboard.press("Escape");
		await page.getByText("Parity calendar", { exact: true }).click();

		await expect(
			page.getByTitle("Parity planning", { exact: true }),
		).toHaveCount(0);

		await page.reload();

		await expect(
			page.getByText("Parity calendar", { exact: true }),
		).toBeVisible();

		await expect(
			page.getByTitle("Parity planning", { exact: true }),
		).toHaveCount(0);

		await page.getByText("Parity calendar", { exact: true }).click();

		for (const view of ["week", "month", "day"]) {
			await page.getByRole("button", { name: view, exact: true }).click();

			if (view === "month") {
				await expect(
					page.getByText("+2", { exact: true }),
				).toBeVisible();
			} else {
				await expect(
					page.getByTitle("Parity planning", { exact: true }),
				).toBeVisible();
			}
		}

		await page.getByRole("button", { name: "Next period" }).click();

		await expect(
			page.getByTitle("Parity planning", { exact: true }),
		).toHaveCount(0);

		await page.getByRole("button", { name: "Previous period" }).click();

		await expect(
			page.getByTitle("Parity planning", { exact: true }),
		).toBeVisible();

		await page.getByRole("button", { name: "Today", exact: true }).click();

		await expect(
			page.getByTitle("Parity planning", { exact: true }),
		).toHaveCount(0);

		expect(errors).toEqual([]);
	} finally {
		await db.query('DELETE FROM "Calendar" WHERE id = $1', [calendarId]);

		await db.query('DELETE FROM "RecoveryMail" WHERE "userId" = $1', [
			userId,
		]);

		await db.query('DELETE FROM "User" WHERE id = $1', [userId]);
		await db.end();
	}
});
