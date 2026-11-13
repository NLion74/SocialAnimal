import { test as base, expect } from "@playwright/test";
import { createHash } from "node:crypto";

// Each scenario represents a separate client. Only the local test proxy is trusted.
export const test = base.extend<{ apiAudit: void }>({
	apiAudit: [
		async ({ page }, use) => {
			const retired: string[] = [];
			page.on("request", (request) => {
				const path = new URL(request.url()).pathname;
				if (
					path.startsWith("/api/") &&
					!path.startsWith("/api/v1/") &&
					path !== "/api/providers/google/callback"
				)
					retired.push(path);
			});
			await use();
			expect(retired).toEqual([]);
		},
		{ auto: true },
	],
	extraHTTPHeaders: async ({}, use, info) => {
		const bytes = createHash("sha256").update(info.testId).digest();

		await use({
			"x-forwarded-for": `192.${bytes[0]}.${bytes[1]}.${bytes[2]}`,
		});
	},
});

export { expect };

export async function adminSection(
	page: import("@playwright/test").Page,
	name: string,
) {
	const back = page.getByRole("button", {
		name: "← Administration",
		exact: true,
	});
	if (await back.isVisible()) await back.click();
	const button = page
		.getByRole("navigation", { name: "Administration sections" })
		.getByRole("button", { name, exact: false });
	await button.focus();
	await button.press("Enter");
}
