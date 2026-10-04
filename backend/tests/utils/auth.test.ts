import bcrypt from "bcryptjs";
import { describe, it, expect } from "vitest";
import {
	hashPassword,
	verifyPassword,
	generateToken,
	verifyToken,
} from "../../src/modules/identity/auth";

describe("hashPassword", () => {
	it("returns a hash and salt", async () => {
		const { hash, salt } = await hashPassword("password123");

		expect(hash).toBeDefined();
		expect(salt).toBeDefined();
		expect(typeof hash).toBe("string");
		expect(typeof salt).toBe("string");
	});

	it("embeds a fresh salt in each Argon2id hash", async () => {
		const first = await hashPassword("password123");
		const second = await hashPassword("password123");

		expect(first.hash.startsWith("$argon2id$")).toBe(true);
		expect(first.hash.split("$")[4]).not.toBe(second.hash.split("$")[4]);
		expect(first.hash).not.toBe(second.hash);
	});

	it("does not store plaintext password in hash", async () => {
		const { hash } = await hashPassword("mysecretpassword");
		expect(hash).not.toContain("mysecretpassword");
	});
});

describe("verifyPassword", () => {
	it("returns true for correct password", async () => {
		const { hash, salt } = await hashPassword("correct-password");
		const result = await verifyPassword("correct-password", hash, salt);
		expect(result).toBe(true);
	});

	it("returns false for wrong password", async () => {
		const { hash, salt } = await hashPassword("correct-password");
		const result = await verifyPassword("wrong-password", hash, salt);
		expect(result).toBe(false);
	});

	it("continues to verify legacy bcrypt hashes and their external salt", async () => {
		const hash = await bcrypt.hash("correct-password" + "legacy-salt", 10);

		expect(
			await verifyPassword("correct-password", hash, "legacy-salt"),
		).toBe(true);

		expect(
			await verifyPassword("correct-password", hash, "wrong-salt"),
		).toBe(false);
	});

	it("does not truncate multi-byte passwords at bcrypt's old byte boundary", async () => {
		const password = "🔐".repeat(24);
		const { hash, salt } = await hashPassword(password);

		expect(await verifyPassword(password + "different", hash, salt)).toBe(
			false,
		);

		expect(await verifyPassword(password, hash, salt)).toBe(true);
	});

	it("returns false for empty string password", async () => {
		const { hash, salt } = await hashPassword("correct-password");
		const result = await verifyPassword("", hash, salt);
		expect(result).toBe(false);
	});
});

describe("generateToken", () => {
	it("returns a JWT string", () => {
		const token = generateToken("user-1");
		expect(typeof token).toBe("string");
		expect(token.split(".")).toHaveLength(3);
	});

	it("encodes userId as sub claim", () => {
		const token = generateToken("user-abc-123");
		const decoded = verifyToken(token);
		expect(decoded.sub).toBe("user-abc-123");
	});

	it("generates different tokens for different users", () => {
		const token1 = generateToken("user-1");
		const token2 = generateToken("user-2");
		expect(token1).not.toBe(token2);
	});
});

describe("verifyToken", () => {
	it("decodes a valid token", () => {
		const token = generateToken("user-1");
		const decoded = verifyToken(token);

		expect(decoded.sub).toBe("user-1");
	});

	it("throws on invalid token", () => {
		expect(() => verifyToken("not-a-token")).toThrow();
	});

	it("throws on tampered token", () => {
		const token = generateToken("user-1");
		const tampered = token.slice(0, -5) + "xxxxx";
		expect(() => verifyToken(tampered)).toThrow();
	});

	it("throws on empty string", () => {
		expect(() => verifyToken("")).toThrow();
	});
});
