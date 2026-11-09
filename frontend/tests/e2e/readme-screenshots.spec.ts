import { test, expect, adminSection } from "./fixtures";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);
const output = "/tmp/socialanimal-readme";

test("reviewable README screenshots with fictional data", async ({
	page,
	request,
}) => {
	test.skip(
		process.env.README_SCREENSHOTS !== "1",
		"Opt-in production screenshot capture",
	);
	expect(process.env.PLAYWRIGHT_PRODUCTION).toBe("1");
	test.setTimeout(120000);
	mkdirSync(output, { recursive: true });
	const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
	await db.connect();
	const ids: string[] = [];
	const password = "fictional-screenshot-password";
	const people = [
		["Alex Morgan", "alex@demo.test"],
		["Jamie Chen", "jamie@demo.test"],
		["Sam Rivera", "sam@demo.test"],
		["Robin Ellis", "robin@demo.test"],
	];
	const calendars: string[] = [];
	const capture = async (name: string, fullPage = false) => {
		await page.mouse.move(0, 0);
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.screenshot({
			path: `${output}/${name}.png`,
			fullPage,
			animations: "disabled",
		});
	};

	try {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.clock.setFixedTime(new Date("2026-11-03T10:00:00Z"));
		await page.goto("/");
		await capture("main-page", true);
		for (const [name, email] of people) {
			const response = await request.post("/api/v1/auth/registrations", {
				data: { name, email, password },
			});
			expect(response.status()).toBe(201);
			ids.push((await response.json()).id);
		}
		await db.query(
			'UPDATE "User" SET "emailVerifiedAt" = NOW() WHERE id = ANY($1)',
			[ids],
		);
		await db.query(
			'UPDATE "User" SET "isAdmin" = true, "accountRole" = $1 WHERE id = $2',
			["admin", ids[0]],
		);
		await db.query(
			'UPDATE "UserSettings" SET timezone = $1 WHERE "userId" = ANY($2)',
			["Europe/Berlin", ids],
		);
		const login = await request.post("/api/v1/auth/sessions", {
			data: { email: people[0][1], password },
		});
		const headers = {
			authorization: `Bearer ${(await login.json()).token}`,
		};
		for (const friend of ids.slice(1)) {
			await db.query(
				'INSERT INTO "Friendship" (id, "user1Id", "user2Id", status, "updatedAt") VALUES ($1, $2, $3, $4, NOW())',
				[randomUUID(), ids[0], friend, "accepted"],
			);
		}
		for (const name of ["Work", "Personal", "Family"]) {
			const connection = await request.post("/api/v1/connections", {
				headers,
				data: {
					type: "ics",
					name,
					credentials: { url: "http://127.0.0.1:4401" },
				},
			});
			const response = await request.post("/api/v1/calendar-imports", {
				headers,
				data: {
					connectionId: (await connection.json()).id,
					remoteId: name,
					name,
					syncInterval: 0,
				},
			});
			expect(response.status()).toBe(201);
			calendars.push((await response.json()).id);
		}
		const rows = [
			[
				0,
				"Team planning",
				"2026-11-03T08:00:00Z",
				60,
				"Studio meeting room",
			],
			[
				0,
				"Design review",
				"2026-11-03T12:00:00Z",
				60,
				"Studio meeting room",
			],
			[1, "Lunch with Jamie", "2026-11-03T11:00:00Z", 60, "Corner café"],
			[2, "Family dinner", "2026-11-03T17:30:00Z", 90, "At home"],
			[0, "Weekly priorities", "2026-11-02T08:00:00Z", 60, "Studio"],
			[1, "Evening run", "2026-11-02T17:00:00Z", 45, "Riverside park"],
			[0, "Project workshop", "2026-11-04T09:00:00Z", 120, "Studio"],
			[1, "Coffee with Sam", "2026-11-04T14:00:00Z", 45, "Corner café"],
			[0, "Team check-in", "2026-11-05T08:30:00Z", 30, "Online"],
			[2, "Cinema night", "2026-11-05T18:00:00Z", 120, "Local cinema"],
			[0, "Weekly wrap-up", "2026-11-06T14:00:00Z", 45, "Studio"],
			[1, "Saturday market", "2026-11-07T09:00:00Z", 90, "Market square"],
			[
				2,
				"Walk in the park",
				"2026-11-08T12:00:00Z",
				120,
				"Riverside park",
			],
			[0, "Project workshop", "2026-11-11T09:00:00Z", 120, "Studio"],
			[1, "Book club", "2026-11-14T14:00:00Z", 90, "Library"],
			[2, "Weekend lunch", "2026-11-21T12:00:00Z", 120, "At home"],
		] as const;
		for (const [index, title, start, minutes, location] of rows)
			await db.query(
				'INSERT INTO "Event" (id, "calendarId", title, description, location, "startTime", "endTime", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())',
				[
					randomUUID(),
					calendars[index],
					title,
					"Bring your notes and ideas.",
					location,
					new Date(start),
					new Date(+new Date(start) + minutes * 60000),
				],
			);
		await db.query(
			'UPDATE "Calendar" SET "lastSync" = $1, "lastSuccess" = $1, "lastAttempt" = $1 WHERE id = ANY($2)',
			[new Date("2026-11-03T07:45:00Z"), calendars],
		);
		const rules = await request.post("/api/v1/rulesets", {
			headers,
			data: {
				name: "Work hours",
				fallback: "titles",
				rules: [
					{
						visibility: "busy",
						when: {
							all: [
								{
									any: [
										"monday",
										"tuesday",
										"wednesday",
										"thursday",
										"friday",
									].map((value) => ({
										attribute: "timegrid.day",
										operator: "equals",
										value,
									})),
								},
								{
									attribute: "timegrid.time",
									operator: "between",
									value: ["09:00", "17:00"],
								},
							],
						},
					},
				],
			},
		});
		expect(rules.status()).toBe(201);
		const ruleId = (await rules.json()).id;
		for (const friend of ids.slice(1))
			await request.put(
				`/api/v1/calendars/${calendars[0]}/grants/${friend}`,
				{ headers, data: { rulesetId: ruleId } },
			);

		await page.goto("/login");
		await page.getByLabel("Email", { exact: true }).fill(people[0][1]);
		await page.getByLabel("Password", { exact: true }).fill(password);
		await page
			.getByRole("button", { name: "Sign In", exact: true })
			.click();
		await expect(page).toHaveURL(/dashboard/);
		await expect(page.getByText("Family", { exact: true })).toBeVisible();
		await capture("dashboard");
		await page.evaluate(() => {
			localStorage.setItem("calendar:date", "2026-11-03T10:00:00Z");
			localStorage.setItem("calendar:view", "week");
		});
		await page.goto("/calendar");
		await expect(
			page.getByTitle("Design review", { exact: true }),
		).toBeVisible();
		for (const view of ["day", "week", "month"]) {
			await page.getByRole("button", { name: view, exact: true }).click();
			if (view === "month")
				await expect(
					page.getByText("+2", { exact: true }),
				).toBeVisible();
			else
				await expect(
					page.getByTitle("Design review", { exact: true }),
				).toBeVisible();
			if (view !== "month")
				await page
					.locator('[class*="weekBodyScroll"]')
					.evaluate((element) => {
						element.scrollTop = 8 * 48;
					});
			await capture(`calendar-${view}`, view === "month");
		}
		await page.goto("/profile");
		await expect(page.getByLabel("Display Name")).toHaveValue(
			"Alex Morgan",
		);
		await capture("profile", true);
		await page.goto("/friends");
		await page.getByRole("button", { name: /Jamie Chen/ }).click();
		await expect(
			page.getByRole("button", { name: /Work Work hours/ }),
		).toBeVisible();
		await capture("friends");
		await page.getByRole("button", { name: /Work Work hours/ }).click();
		await capture("friend-sharemenu");
		await page
			.getByRole("button", { name: "Edit ruleset", exact: true })
			.click();
		await expect(
			page.getByRole("button", { name: "Basic", exact: true }),
		).toBeEnabled();
		await capture("ruleset-basic");
		await page.getByRole("button", { name: "Edit exception 1" }).click();
		for (const width of [320, 390, 768, 1440]) {
			await page.setViewportSize({ width, height: 1000 });
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true);
			await capture(`ruleset-edit-${width}`, true);
		}
		await page.getByRole("button", { name: "Cancel exception" }).click();
		await page.getByRole("button", { name: "Cancel", exact: true }).click();
		await page.goto("/friends");
		await page
			.getByRole("button", { name: "Add Friend", exact: true })
			.click();
		await page.getByLabel("Friend's Email").fill("taylor@demo.test");
		await capture("friend-add");
		await page.keyboard.press("Escape");
		await page.goto("/admin");
		await adminSection(page, "Settings");
		await expect(
			page.getByLabel("Sync future days", { exact: true }),
		).toBeVisible();
		await capture("admin-settings", true);
		await adminSection(page, "Users");
		await page.getByLabel("Search users").fill("@demo.test");
		await page.getByRole("button", { name: "Search", exact: true }).click();
		await expect(
			page.getByRole("row").filter({ hasText: "Jamie Chen" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Manage", exact: true }),
		).toHaveCount(4);
		await capture("admin-users");
		for (const width of [320, 390, 768]) {
			await page.setViewportSize({ width, height: 844 });
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= innerWidth,
				),
			).toBe(true);
			await capture(`admin-users-${width}`, true);
		}
	} finally {
		await db.query('DELETE FROM "Calendar" WHERE "userId" = ANY($1)', [
			ids,
		]);
		await db.query('DELETE FROM "User" WHERE id = ANY($1)', [ids]);
		await db.end();
	}
});
