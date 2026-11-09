import { test, expect } from "./fixtures";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

test("opt-in route and role review with fictional accounts", async ({
	browser,
	request,
}) => {
	test.skip(process.env.UI_REVIEW !== "1", "Opt-in visual review");
	test.setTimeout(180000);
	const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
	await db.connect();
	const ids: string[] = [];
	const output = "/tmp/socialanimal-ui-review";
	mkdirSync(output, { recursive: true });
	const results: object[] = [];
	try {
		for (const role of [
			"normal",
			"admin",
			"moderator",
			"readonly",
			"disabled",
		]) {
			const email = `review-${role}-${randomUUID()}@example.test`,
				password = "fictional-review-password";
			const registered = await request.post(
				"/api/v1/auth/registrations",
				{ data: { name: `Review ${role}`, email, password } },
			);
			expect(registered.status()).toBe(201);
			const { id } = await registered.json();
			ids.push(id);
			await db.query(
				'UPDATE "User" SET "accountRole"=$1,"isAdmin"=$2,"disabled"=$3,"emailVerifiedAt"=NOW() WHERE id=$4',
				[
					role === "disabled" ? "normal" : role,
					role === "admin",
					role === "disabled",
					id,
				],
			);
			const login = await request.post("/api/v1/auth/sessions", {
				data: { email, password },
			});
			if (role === "disabled") {
				expect(login.status()).toBe(401);
				results.push({ role, login: "denied" });
				continue;
			}
			expect(login.status()).toBe(200);
			const { token } = await login.json();
			const context = await browser.newContext({
				viewport: { width: 1440, height: 1000 },
			});
			await context.addInitScript(
				(token) => localStorage.setItem("token", token),
				token,
			);
			const page = await context.newPage();
			for (const route of [
				"dashboard",
				"calendar",
				"friends",
				"profile",
				"admin",
			]) {
				await page.goto("/" + route);
				await expect(page.locator("main")).toBeVisible();
				await expect(
					page.getByText("Loading…", { exact: true }),
				).toHaveCount(0);
				if (route === "admin" && ["normal", "readonly"].includes(role))
					await expect(
						page.getByText(
							"Administrator or moderator access is required.",
						),
					).toBeVisible();
				for (const width of [1440, 390]) {
					await page.setViewportSize({ width, height: 900 });
					await page.screenshot({
						path: `${output}/${role}-${route}-${width}.png`,
						fullPage: true,
						animations: "disabled",
					});
					results.push({
						role,
						route,
						width,
						overflow: await page.evaluate(
							() =>
								document.documentElement.scrollWidth >
								innerWidth,
						),
					});
				}
			}
			await context.close();
		}
		const context = await browser.newContext({
			viewport: { width: 390, height: 844 },
		});
		const page = await context.newPage();
		for (const route of [
			"/",
			"/login",
			"/register",
			"/forgot-password",
			"/reset-password",
			"/verify-email",
			"/shared",
		]) {
			await page.goto(route);
			await page.screenshot({
				path: `${output}/anonymous-${route.replace(/\//g, "") || "home"}.png`,
				fullPage: true,
			});
			results.push({ role: "anonymous", route });
		}
		await context.close();
		writeFileSync(
			output + "/coverage.json",
			JSON.stringify(results, null, 2),
		);
	} finally {
		await db.query('DELETE FROM "User" WHERE id=ANY($1)', [ids]);
		await db.end();
	}
});
