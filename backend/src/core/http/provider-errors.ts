const messages: Record<string, string> = {
	PROVIDER_AUTH_FAILED:
		"The provider rejected access. Check the credentials or sharing permissions.",
	PROVIDER_ADDRESS_BLOCKED:
		"The provider address is blocked by the server's network policy. For a trusted private server, an administrator can allow its exact hostname in PRIVATE_PROVIDER_HOSTS.",
	PROVIDER_TIMEOUT:
		"The provider did not respond in time. Try again shortly.",
	PROVIDER_DNS_FAILED:
		"The server could not resolve the provider hostname. Check the URL and server DNS configuration.",
	PROVIDER_TLS_FAILED:
		"The provider's HTTPS certificate could not be verified. Check its certificate and server hostname.",
	PROVIDER_CONNECTION_FAILED:
		"The server could not connect to the provider. Check its availability and server network access.",
	PROVIDER_RESPONSE_TOO_LARGE:
		"The calendar exceeds the supported size or event limit. Use a smaller date range or feed.",
	PROVIDER_INVALID_CALENDAR:
		"The response could not be read as an ICS calendar. Check that the URL serves a calendar rather than a web page.",
	PROVIDER_NOT_FOUND:
		"The provider could not find this calendar URL. Check the full subscription address.",
	PROVIDER_UNAVAILABLE:
		"The provider is temporarily unavailable. Try again shortly.",
};

// Never return arbitrary upstream error messages: they may contain URLs or credentials.
export function providerFailure(error: unknown): {
	code: string;
	message: string;
} {
	const pending: unknown[] = [error];
	const seen = new Set<unknown>();

	for (let i = 0; pending.length && i < 16; i++) {
		const item = pending.shift();
		if (!item || typeof item !== "object" || seen.has(item)) continue;
		seen.add(item);

		const value = item as {
			code?: string;
			name?: string;
			message?: string;
			cause?: unknown;
			errors?: unknown[];
		};

		const raw = value.code || value.message || "";
		let code = messages[raw] ? raw : undefined;

		if (
			["TimeoutError", "AbortError"].includes(value.name || "") ||
			[
				"ETIMEDOUT",
				"UND_ERR_CONNECT_TIMEOUT",
				"UND_ERR_HEADERS_TIMEOUT",
			].includes(raw)
		)
			code = "PROVIDER_TIMEOUT";

		if (["ENOTFOUND", "EAI_AGAIN"].includes(raw))
			code = "PROVIDER_DNS_FAILED";

		if (/CERT|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/.test(raw))
			code = "PROVIDER_TLS_FAILED";

		if (
			[
				"ECONNREFUSED",
				"ECONNRESET",
				"ENETUNREACH",
				"EHOSTUNREACH",
			].includes(raw)
		)
			code = "PROVIDER_CONNECTION_FAILED";

		if (raw === "ERR_WORKER_OUT_OF_MEMORY")
			code = "PROVIDER_RESPONSE_TOO_LARGE";

		if (code) return { code, message: messages[code] };

		pending.push(
			value.cause,
			...(Array.isArray(value.errors) ? value.errors.slice(0, 8) : []),
		);
	}

	return {
		code: "PROVIDER_UNAVAILABLE",
		message: messages.PROVIDER_UNAVAILABLE,
	};
}

export function publicProviderMessage(message: string | null) {
	return message && Object.values(messages).includes(message)
		? message
		: message
			? messages.PROVIDER_UNAVAILABLE
			: null;
}
