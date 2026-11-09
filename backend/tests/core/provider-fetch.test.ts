import { afterEach, expect, it, vi } from "vitest";
import {
	assertProviderAddress,
	providerFetch,
} from "../../src/core/http/provider-fetch";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

it("blocks private, metadata, loopback, mapped IPv6 and non-HTTP targets", async () => {
	for (const address of [
		"127.0.0.1",
		"10.0.0.1",
		"169.254.169.254",
		"192.168.1.1",
		"100.64.0.1",
		"::1",
		"fe80::1",
		"fd00::1",
		"::ffff:127.0.0.1",
	])
		expect(() => assertProviderAddress(address, address)).toThrow(
			"BLOCKED",
		);
	expect(() =>
		assertProviderAddress("8.8.8.8", "example.test"),
	).not.toThrow();
	for (const url of [
		"http://2130706433",
		"http://[::1]",
		"file:///etc/passwd",
		"http://user:pass@example.test",
	])
		await expect(providerFetch(url)).rejects.toThrow("BLOCKED");
});

it("allows only explicitly configured private provider hosts", () => {
	vi.stubEnv("PRIVATE_PROVIDER_HOSTS", "caldav.home");
	expect(() =>
		assertProviderAddress("10.0.0.1", "caldav.home"),
	).not.toThrow();
	expect(() => assertProviderAddress("10.0.0.1", "other.home")).toThrow(
		"BLOCKED",
	);
});

it("checks redirect destinations and refuses HTTPS downgrades", async () => {
	const request = vi.fn().mockResolvedValue(
		new Response(null, {
			status: 302,
			headers: { location: "http://169.254.169.254/latest" },
		}),
	);
	vi.stubGlobal("fetch", request);
	await expect(providerFetch("http://example.test")).rejects.toThrow(
		"BLOCKED",
	);
	expect(request).toHaveBeenCalledTimes(1);
	request.mockResolvedValue(
		new Response(null, {
			status: 302,
			headers: { location: "http://example.test/feed" },
		}),
	);
	await expect(providerFetch("https://example.test")).rejects.toThrow(
		"BLOCKED",
	);
});

it("removes credentials on cross-origin redirects", async () => {
	const seen: Array<string | null> = [];

	vi.stubGlobal(
		"fetch",
		vi.fn(async (_url, init) => {
			seen.push(new Headers(init.headers).get("authorization"));
			return seen.length === 1
				? new Response(null, {
						status: 302,
						headers: { location: "https://other.test/feed" },
					})
				: new Response("calendar");
		}),
	);

	const response = await providerFetch("https://example.test", {
		headers: { authorization: "secret" },
	});
	expect(await response.text()).toBe("calendar");
	expect(response.url).toBe("https://other.test/feed");
	expect(response.redirected).toBe(true);

	expect(seen).toEqual(["secret", null]);
});
