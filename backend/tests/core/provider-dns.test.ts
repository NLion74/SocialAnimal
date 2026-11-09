import { lookup } from "node:dns/promises";
import { afterEach, expect, it, vi } from "vitest";
import { resolveProviderAddresses } from "../../src/core/http/provider-fetch";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

afterEach(() => {
	vi.resetAllMocks();
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

it.each(["EAI_AGAIN", "ENOTFOUND"])(
	"recovers from a brief %s lookup failure before opening a connection",
	async (code) => {
		vi.useFakeTimers();
		vi.mocked(lookup)
			.mockRejectedValueOnce(
				Object.assign(new Error("DNS failed"), { code }),
			)
			.mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]);

		const result = resolveProviderAddresses("example.test");
		await vi.advanceTimersByTimeAsync(250);

		await expect(result).resolves.toEqual([
			{ address: "8.8.8.8", family: 4 },
		]);
		expect(lookup).toHaveBeenCalledTimes(2);
	},
);

it("stops after three failed lookups and preserves the DNS error", async () => {
	vi.useFakeTimers();
	const error = Object.assign(new Error("DNS failed"), { code: "ENOTFOUND" });
	vi.mocked(lookup).mockRejectedValue(error);

	const assertion = expect(
		resolveProviderAddresses("example.test"),
	).rejects.toBe(error);
	await vi.advanceTimersByTimeAsync(1000);
	await assertion;
	expect(lookup).toHaveBeenCalledTimes(3);
});

it("still blocks private addresses returned after a DNS retry", async () => {
	vi.useFakeTimers();
	vi.stubEnv("PRIVATE_PROVIDER_HOSTS", "");
	vi.mocked(lookup)
		.mockRejectedValueOnce(
			Object.assign(new Error("DNS failed"), { code: "EAI_AGAIN" }),
		)
		.mockResolvedValueOnce([
			{ address: "8.8.8.8", family: 4 },
			{ address: "127.0.0.1", family: 4 },
		]);

	const assertion = expect(
		resolveProviderAddresses("example.test"),
	).rejects.toThrow("PROVIDER_ADDRESS_BLOCKED");
	await vi.advanceTimersByTimeAsync(250);
	await assertion;
	expect(lookup).toHaveBeenCalledTimes(2);
});

it("does not retry unrelated resolver errors", async () => {
	const error = Object.assign(new Error("Invalid lookup"), {
		code: "EINVAL",
	});
	vi.mocked(lookup).mockRejectedValue(error);

	await expect(resolveProviderAddresses("example.test")).rejects.toBe(error);
	expect(lookup).toHaveBeenCalledTimes(1);
});
