import argon2 from "argon2";
import bcrypt from "bcryptjs";
import { fail } from "../../core/http";

// Bound native hashing memory and queued work, including login attempts.
let running = 0;

const waiting: Array<() => void> = [];

async function bounded<T>(work: () => Promise<T>): Promise<T> {
	if (running >= 2) {
		if (waiting.length >= 16)
			fail(
				429,
				"RATE_LIMITED",
				"Too many authentication attempts. Try again shortly.",
			);

		await new Promise<void>((resolve) => waiting.push(resolve));
	} else running++;

	try {
		return await work();
	} finally {
		const next = waiting.shift();

		if (next) next();
		else running--;
	}
}

export const hashPassword = (password: string) =>
	bounded(async () => ({
		hash: await argon2.hash(password, {
			type: argon2.argon2id,
			memoryCost: 19456,
			timeCost: 2,
			parallelism: 1,
		}),
		salt: "",
	}));

export const verifyPassword = (password: string, hash: string, salt: string) =>
	bounded(() =>
		hash.startsWith("$argon2id$")
			? argon2.verify(hash, password)
			: bcrypt.compare(password + salt, hash),
	);
