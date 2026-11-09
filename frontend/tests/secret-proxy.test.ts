import { afterEach, describe, expect, it, vi } from "vitest";
import { proxySecretGet } from "../lib/secret-proxy";

afterEach(() => vi.unstubAllGlobals());

describe("Credential URL proxy", () => {
	it("returns a generic upstream failure without exposing secret URLs", async () => {
		const error = vi.spyOn(console, "error");

		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockRejectedValue(
					new Error("Request failed for /feeds/private-token.ics"),
				),
		);

		const response = await proxySecretGet("/feeds/private-token.ics");
		expect(response.status).toBe(502);
		expect(await response.text()).not.toContain("private-token");
		expect(error).not.toHaveBeenCalled();
		expect(response.headers.get("referrer-policy")).toBe("no-referrer");
		error.mockRestore();
	});

	it("preserves OAuth redirects without following them or forwarding cookies", async () => {
		const fetch = vi.fn().mockResolvedValue(
			new Response(null, {
				status: 302,
				headers: {
					location: "https://app.example/dashboard",
					"set-cookie": "private=value",
				},
			}),
		);

		vi.stubGlobal("fetch", fetch);

		const response = await proxySecretGet(
			"/api/v1/connections/google/callback?state=private",
		);

		expect(fetch.mock.calls[0][1]).toMatchObject({
			redirect: "manual",
			cache: "no-store",
		});

		expect(response.status).toBe(302);

		expect(response.headers.get("location")).toBe(
			"https://app.example/dashboard",
		);

		expect(response.headers.get("set-cookie")).toBeNull();
	});
});
