import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { Agent } from "undici";
import ipaddr from "ipaddr.js";

const allowed = (hostname: string) =>
	(process.env.PRIVATE_PROVIDER_HOSTS || "")
		.split(",")
		.map((host) => host.trim().toLowerCase())
		.includes(hostname.toLowerCase());

export function assertProviderAddress(address: string, hostname: string) {
	if (!allowed(hostname) && ipaddr.process(address).range() !== "unicast")
		throw new Error("PROVIDER_ADDRESS_BLOCKED");
}

function checkUrl(url: URL) {
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password
	)
		throw new Error("PROVIDER_ADDRESS_BLOCKED");

	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	if (isIP(hostname)) assertProviderAddress(hostname, hostname);
}

export async function resolveProviderAddresses(hostname: string) {
	// Retry DNS before opening a socket, so remote requests are never replayed.
	// A resolver recovering after a network interruption may also report ENOTFOUND.
	const retryDelays = [250, 750];

	for (let attempt = 0; ; attempt++) {
		try {
			const addresses = await lookup(hostname, {
				all: true,
				verbatim: true,
			});

			for (const result of addresses)
				assertProviderAddress(result.address, hostname);

			return addresses;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;

			if (
				attempt >= retryDelays.length ||
				!code ||
				!["EAI_AGAIN", "ENOTFOUND"].includes(code)
			)
				throw error;

			await delay(retryDelays[attempt]);
		}
	}
}

// Validate the addresses actually used by the socket, preventing DNS rebinding.
const dispatcher = new Agent({
	connect: {
		lookup(hostname, options, callback) {
			void resolveProviderAddresses(hostname).then(
				(addresses) => {
					try {
						const family =
							typeof options.family === "number"
								? options.family
								: 0;
						const matches = addresses.filter(
							(result) => !family || result.family === family,
						);
						if (!matches.length)
							throw new Error("PROVIDER_ADDRESS_BLOCKED");

						if (options.all) callback(null, matches);
						else
							callback(
								null,
								matches[0].address,
								matches[0].family,
							);
					} catch (cause) {
						callback(cause as Error, [], 0);
					}
				},
				(error: Error) => callback(error, [], 0),
			);
		},
	},
});

export async function providerFetch(
	input: string | URL,
	init: RequestInit = {},
): Promise<Response> {
	let url = new URL(input);
	let method = init.method || "GET";
	let body = init.body;
	const headers = new Headers(init.headers);
	const signal = init.signal || AbortSignal.timeout(60000);

	for (let redirects = 0; redirects <= 5; redirects++) {
		checkUrl(url);
		const response = await fetch(url.toString(), {
			...init,
			method,
			body,
			headers,
			signal,
			redirect: "manual",
			dispatcher,
		} as unknown as RequestInit);

		if ([301, 302, 303, 307, 308].includes(response.status)) {
			await response.body?.cancel();
			const location = response.headers.get("location");
			if (!location) throw new Error("PROVIDER_UNAVAILABLE");
			const next = new URL(location, url);
			if (url.protocol === "https:" && next.protocol !== "https:")
				throw new Error("PROVIDER_ADDRESS_BLOCKED");

			if (url.origin !== next.origin) {
				headers.delete("authorization");
				headers.delete("cookie");
			}

			if (
				response.status === 303 ||
				([301, 302].includes(response.status) && method === "POST")
			) {
				method = "GET";
				body = undefined;
				headers.delete("content-type");
			}

			url = next;
			continue;
		}

		if ([204, 205, 304].includes(response.status)) return response;
		const reader = response.body?.getReader();
		if (!reader) return response;
		const chunks: Uint8Array[] = [];
		let size = 0;

		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				size += value.length;
				if (size > 16 * 1024 * 1024)
					throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
				chunks.push(value);
			}
		} finally {
			await reader.cancel();
		}

		const bounded = new Response(Buffer.concat(chunks), {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});

		Object.defineProperties(bounded, {
			url: { value: url.toString() },
			redirected: { value: redirects > 0 },
		});
		return bounded;
	}

	throw new Error("PROVIDER_UNAVAILABLE");
}
