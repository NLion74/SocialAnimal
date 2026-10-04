// Handle credential-bearing URLs without Next's rewrite error logger printing them.
export async function proxySecretGet(path: string) {
	const headers = {
		"Cache-Control": "no-store",
		"Referrer-Policy": "no-referrer",
		"X-Content-Type-Options": "nosniff",
	};

	try {
		const upstream = await fetch(
			new URL(path, process.env.BACKEND_URL || "http://backend:4000"),
			{
				redirect: "manual",
				cache: "no-store",
				signal: AbortSignal.timeout(45000),
			},
		);

		const forwarded = new Headers(headers);

		for (const name of ["content-type", "location", "retry-after"]) {
			const value = upstream.headers.get(name);
			if (value) forwarded.set(name, value);
		}

		return new Response(await upstream.arrayBuffer(), {
			status: upstream.status,
			headers: forwarded,
		});
	} catch {
		return Response.json(
			{
				code: "BACKEND_UNAVAILABLE",
				message:
					"The service is temporarily unavailable. Try again shortly.",
				requestId: crypto.randomUUID(),
			},
			{ status: 502, headers },
		);
	}
}
