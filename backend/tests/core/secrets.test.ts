import { it, expect } from "vitest";
import {
	encrypt,
	decrypt,
	opaqueToken,
	tokenHash,
} from "../../src/core/secrets";

it("encrypts with randomized authenticated versioned envelopes", () => {
	const data = { password: "secret", url: "https://private.test" };

	const a = encrypt(data),
		b = encrypt(data);

	expect(a).not.toBe(b);
	expect(a).not.toContain("secret");
	expect(a).toMatch(/^v1:/);
	expect(decrypt(a)).toEqual(data);
	expect(() => decrypt(a.slice(0, -4) + "AAAA")).toThrow();
	expect(tokenHash(opaqueToken())).toHaveLength(64);
});
