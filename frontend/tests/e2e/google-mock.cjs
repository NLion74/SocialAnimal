// Loaded only by Playwright's backend process; real application routes and DB are used.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = new URL(String(input));
	if (url.hostname === "oauth2.googleapis.com") {
		if (init.body.get("redirect_uri") !== process.env.GOOGLE_REDIRECT_URI)
			return Response.json(
				{ error: "redirect_uri_mismatch" },
				{ status: 400 },
			);
		return Response.json({
			access_token: "mock-google-access",
			refresh_token: "mock-google-refresh",
		});
	}
	if (url.hostname === "www.googleapis.com") {
		if (url.pathname.endsWith("/calendarList"))
			return Response.json({
				items: [
					{
						id: "mock-work",
						summary: "Google Work",
						backgroundColor: "#123456",
					},
					{ id: "mock-personal", summary: "Google Personal" },
				],
			});
		return Response.json({ items: [] });
	}
	return originalFetch(input, init);
};
