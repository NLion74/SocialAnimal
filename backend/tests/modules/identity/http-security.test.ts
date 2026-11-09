import { describe, expect, it } from "vitest";
import { buildApp } from "../../../src/app";

describe("HTTP abuse controls", () => {
	it("limits authentication before hashing or database work, ignoring spoofed forwarded addresses", async () => {
		const app = await buildApp();

		try {
			for (let i = 0; i < 10; i++)
				expect(
					(
						await app.inject({
							method: "POST",
							url: "/api/v1/auth/password-resets",
							payload: {},
							headers: { "x-forwarded-for": `198.51.100.${i}` },
						})
					).statusCode,
				).toBe(400);

			const response = await app.inject({
				method: "POST",
				url: "/api/v1/auth/password-resets",
				payload: {},
			});

			expect(response.statusCode).toBe(429);

			expect(response.json()).toMatchObject({
				code: "RATE_LIMITED",
				requestId: expect.any(String),
			});

			expect(response.headers["retry-after"]).toBeDefined();
		} finally {
			await app.close();
		}
	});

	it("rejects deeply nested JSON before recursive schema validation and restricts browser CORS", async () => {
		const app = await buildApp();

		try {
			let value: unknown = {};
			for (let i = 0; i < 100; i++) value = { not: value };

			const response = await app.inject({
				method: "POST",
				url: "/api/v1/auth/password-resets",
				payload: value as object,
			});

			expect(response.statusCode).toBe(400);

			expect(response.json().message).toBe(
				"Request structure is too complex",
			);

			const foreign = await app.inject({
				method: "GET",
				url: "/health",
				headers: { origin: "https://evil.example" },
			});

			expect(
				foreign.headers["access-control-allow-origin"],
			).toBeUndefined();
		} finally {
			await app.close();
		}
	});
});
