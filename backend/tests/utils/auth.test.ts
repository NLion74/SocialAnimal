import { describe, it, expect } from "vitest";
import {
    hashPassword,
    verifyPassword,
    generateToken,
    verifyToken,
    signOAuthState,
    verifyOAuthState,
} from "../../src/utils/auth";

describe("hashPassword", () => {
    it("returns a hash and salt", async () => {
        const { hash, salt } = await hashPassword("password123");

        expect(hash).toBeDefined();
        expect(salt).toBeDefined();
        expect(typeof hash).toBe("string");
        expect(typeof salt).toBe("string");
    });

    it("returns different salt each time", async () => {
        const first = await hashPassword("password123");
        const second = await hashPassword("password123");

        expect(first.salt).not.toBe(second.salt);
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

    it("returns false for correct password but wrong salt", async () => {
        const { hash } = await hashPassword("correct-password");
        const { salt: wrongSalt } = await hashPassword("correct-password");
        const result = await verifyPassword(
            "correct-password",
            hash,
            wrongSalt,
        );
        expect(result).toBe(false);
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

describe("signOAuthState / verifyOAuthState", () => {
    it("round-trips a userId through sign and verify", () => {
        const state = signOAuthState("user-abc");
        const result = verifyOAuthState(state);
        expect(result).toBe("user-abc");
    });

    it("returns null for a plain userId without signature", () => {
        const result = verifyOAuthState("user-abc");
        expect(result).toBeNull();
    });

    it("returns null for a tampered signature", () => {
        const state = signOAuthState("user-abc");
        const tampered = state.slice(0, -5) + "zzzzz";
        const result = verifyOAuthState(tampered);
        expect(result).toBeNull();
    });

    it("returns null for completely forged state", () => {
        const result = verifyOAuthState(
            "attacker-id.fakesignature0000000000000000000000000000000000000000000000000000",
        );
        expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
        const result = verifyOAuthState("");
        expect(result).toBeNull();
    });

    it("produces different signatures for different userIds", () => {
        const state1 = signOAuthState("user-1");
        const state2 = signOAuthState("user-2");
        expect(state1).not.toBe(state2);
    });

    it("produces consistent signatures for the same userId", () => {
        const state1 = signOAuthState("user-1");
        const state2 = signOAuthState("user-1");
        expect(state1).toBe(state2);
    });

    it("handles userIds containing dots", () => {
        const state = signOAuthState("user.with.dots");
        const result = verifyOAuthState(state);
        expect(result).toBe("user.with.dots");
    });
});
