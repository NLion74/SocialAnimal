import { expect, it } from "vitest";
import {
	providerFailure,
	publicProviderMessage,
} from "../../src/core/http/provider-errors";

it("classifies nested network errors without exposing provider URLs or credentials", () => {
	for (const [code, expected] of [
		["ENOTFOUND", "PROVIDER_DNS_FAILED"],
		["ECONNREFUSED", "PROVIDER_CONNECTION_FAILED"],
		["CERT_HAS_EXPIRED", "PROVIDER_TLS_FAILED"],
		["PROVIDER_ADDRESS_BLOCKED", "PROVIDER_ADDRESS_BLOCKED"],
		["UND_ERR_CONNECT_TIMEOUT", "PROVIDER_TIMEOUT"],
	]) {
		const error = new Error(
			"Fetch failed for https://secret-token@provider.test/private",
			{ cause: Object.assign(new Error(code), { code }) },
		);

		const failure = providerFailure(error);
		expect(failure.code).toBe(expected);
		expect(failure.message).not.toContain("secret-token");
		expect(publicProviderMessage(failure.message)).toBe(failure.message);
	}

	expect(
		publicProviderMessage("Old provider error with private-token"),
	).not.toContain("private-token");
});
