import { test as base, expect } from "@playwright/test";
import { createHash } from "node:crypto";

// Each scenario represents a separate client. Only the local test proxy is trusted.
export const test = base.extend({
	extraHTTPHeaders: async ({}, use, info) => {
		const bytes = createHash("sha256").update(info.testId).digest();

		await use({
			"x-forwarded-for": `192.${bytes[0]}.${bytes[1]}.${bytes[2]}`,
		});
	},
});

export { expect };
