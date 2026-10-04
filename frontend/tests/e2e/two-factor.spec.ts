import { test, expect } from "./fixtures";
import { createRequire } from "node:module";
import { createHmac, createDecipheriv, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";

const { Client } = createRequire(import.meta.url)(
	"../../../backend/node_modules/pg",
);

function codeFor(secret: string) {
	let value = 0,
		bits = 0;

	const bytes: number[] = [];

	for (const char of secret) {
		value = (value << 5) | "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char);
		bits += 5;

		if (bits >= 8) {
			bits -= 8;
			bytes.push((value >>> bits) & 255);
		}
	}

	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));

	const digest = createHmac("sha1", Buffer.from(bytes))
		.update(counter)
		.digest();

	return String(
		(digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000,
	).padStart(6, "0");
}

function mailPayload(envelope: string) {
	const [, iv, tag, body] = envelope.split(":");

	const decipher = createDecipheriv(
		"aes-256-gcm",
		Buffer.from("ab".repeat(32), "hex"),
		Buffer.from(iv, "base64url"),
	);

	decipher.setAuthTag(Buffer.from(tag, "base64url"));

	return JSON.parse(
		Buffer.concat([
			decipher.update(Buffer.from(body, "base64url")),
			decipher.final(),
		]).toString(),
	);
}

test("optional verification, authenticator setup, recovery login, email switching, and admin email jobs", async ({
	page,
	request,
}) => {
	const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
	await db.connect();

	const email = `security-${randomUUID()}@example.test`,
		password = "security-browser-password";

	const account = await request.post("/api/v1/auth/registrations", {
		data: { email, password },
	});

	expect(account.status()).toBe(201);
	const id = (await account.json()).id;
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	mkdirSync("/tmp/socialanimal-style-review", { recursive: true });

	async function signIn(recovery = false) {
		await page.goto("/login");
		await page.getByLabel("Email", { exact: true }).fill(email);
		await page.getByLabel("Password", { exact: true }).fill(password);
		if (recovery) await page.getByLabel("Use a recovery code").check();

		await page
			.getByRole("button", { name: "Sign In", exact: true })
			.click();
	}

	try {
		await db.query(
			'UPDATE "User" SET "isAdmin" = true, "accountRole" = \'admin\' WHERE id = $1',
			[id],
		);

		await signIn();
		await expect(page).toHaveURL(/dashboard/);
		await page.goto("/profile");

		await expect(
			page.getByText("Your email address is not verified yet.", {
				exact: false,
			}),
		).toBeVisible();

		await db.query(
			'UPDATE "User" SET "emailVerifiedAt" = NOW() WHERE id = $1',
			[id],
		);

		await page
			.getByRole("button", { name: "Check verification status" })
			.click();

		await expect(
			page.getByRole("button", { name: "Resend verification email" }),
		).toHaveCount(0);

		await page.getByLabel("New method").selectOption("totp");
		await page.getByRole("button", { name: "Set up method" }).click();

		const secret = await page
			.getByLabel("Authenticator setup key")
			.inputValue();

		await page.getByLabel("Confirmation code").fill(codeFor(secret));
		await page.getByRole("button", { name: "Confirm method" }).click();

		await expect(
			page.getByText("Two-factor authentication updated.", {
				exact: false,
			}),
		).toBeVisible();

		const codes = (
			await page
				.getByLabel("Recovery codes", { exact: true })
				.inputValue()
		).split(/\s+/);

		expect(codes).toHaveLength(10);
		await page.setViewportSize({ width: 390, height: 844 });

		await page
			.getByRole("heading", { name: "Two-factor authentication" })
			.scrollIntoViewIfNeeded();

		await page.screenshot({
			path: "/tmp/socialanimal-style-review/two-factor-mobile.png",
			fullPage: true,
		});

		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= innerWidth,
			),
		).toBe(true);

		await page
			.getByRole("button", { name: "Sign out", exact: true })
			.click();

		await expect(page).toHaveURL(/\/login$/);
		await signIn(true);
		await page.locator("#login-code").fill(codes[0]);

		await page
			.getByRole("button", { name: "Sign In", exact: true })
			.click();

		await expect(page).toHaveURL(/dashboard/);
		await page.goto("/profile");
		await page.getByLabel("New method").selectOption("email");

		await db.query(
			'UPDATE "AuthChallenge" SET "createdAt" = NOW() - INTERVAL \'2 minutes\' WHERE "userId" = $1',
			[id],
		);

		await page.getByRole("button", { name: "Set up method" }).click();

		await expect(
			page.getByText("A code has been queued", { exact: false }),
		).toBeVisible();

		const job = (
			await db.query(
				'SELECT payload FROM "RecoveryMail" WHERE "userId" = $1 AND kind = \'code\' ORDER BY "createdAt" DESC LIMIT 1',
				[id],
			)
		).rows[0];

		await page
			.getByLabel("Confirmation code")
			.fill(mailPayload(job.payload).token);

		await page.getByRole("button", { name: "Confirm method" }).click();

		await expect(
			page.getByText("Two-factor authentication updated.", {
				exact: false,
			}),
		).toBeVisible();

		await page.goto("/admin");

		await expect(
			page.getByRole("heading", { name: "Email jobs" }),
		).toBeVisible();

		await page.getByRole("button", { name: "Refresh email jobs" }).click();

		await expect(
			page.getByRole("region", { name: "Email jobs", exact: true }),
		).toContainText("Authentication code");

		await page
			.getByRole("heading", { name: "Email jobs" })
			.scrollIntoViewIfNeeded();

		await page.screenshot({
			path: "/tmp/socialanimal-style-review/email-jobs-mobile.png",
			fullPage: true,
		});

		expect(errors).toEqual([]);
	} finally {
		await db.query('DELETE FROM "RecoveryMail" WHERE "userId" = $1', [id]);
		await db.query('DELETE FROM "User" WHERE id = $1', [id]);
		await db.end();
	}
});
