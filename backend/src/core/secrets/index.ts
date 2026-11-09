import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	createHash,
} from "node:crypto";

export type Credentials = Record<string, string>;

export function encryptionKey(): Buffer {
	const raw = process.env.CREDENTIAL_ENCRYPTION_KEY;

	if (!raw || !/^[a-fA-F0-9]{64}$/.test(raw))
		throw new Error(
			"CREDENTIAL_ENCRYPTION_KEY must be a backed-up 32-byte hex key",
		);

	return Buffer.from(raw, "hex");
}

export function encrypt(value: Credentials): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);

	const body = Buffer.concat([
		cipher.update(JSON.stringify(value), "utf8"),
		cipher.final(),
	]);

	return [
		"v1",
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		body.toString("base64url"),
	].join(":");
}

export function decrypt(value: string): Credentials {
	const [version, iv, tag, body] = value.split(":");

	if (version !== "v1" || !iv || !tag || !body)
		throw new Error("Unsupported credential envelope");

	const cipher = createDecipheriv(
		"aes-256-gcm",
		encryptionKey(),
		Buffer.from(iv, "base64url"),
	);

	cipher.setAuthTag(Buffer.from(tag, "base64url"));

	return JSON.parse(
		Buffer.concat([
			cipher.update(Buffer.from(body, "base64url")),
			cipher.final(),
		]).toString("utf8"),
	);
}

export const opaqueToken = () => randomBytes(32).toString("base64url");

export const tokenHash = (token: string) =>
	createHash("sha256").update(token).digest("hex");
