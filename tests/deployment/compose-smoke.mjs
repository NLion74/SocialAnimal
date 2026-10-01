import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.SMOKE_BASE_URL;

if (!base) throw new Error("SMOKE_BASE_URL is required");

const request = (path, init) =>
	fetch(new URL(path, base), { signal: AbortSignal.timeout(20000), ...init });

assert.equal((await request("/")).status, 200);
const settings = await request("/api/v1/settings/public");
assert.equal(settings.status, 200, "Frontend must proxy the backend API");
assert.equal(typeof (await settings.json()).registrationsOpen, "boolean");
assert.equal((await request("/api/v1/me")).status, 401);
assert.equal((await request("/api/users/me")).status, 410);
assert.equal((await request("/feeds/unknown.ics")).status, 404);
const spec = await (await request("/api/v1/openapi.json")).json();
assert.ok(spec.paths["/api/v1/connections"]);

// Writes are enabled only for disposable deployment-test stacks.
if (process.env.SMOKE_ALLOW_WRITES === "1") {
	const password = randomUUID();
	const email = `compose-${randomUUID()}@example.test`;
	const registration = await request("/api/v1/auth/registrations", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email,
			password,
		}),
	});
	assert.equal(registration.status, 201);
	const session = await request("/api/v1/auth/sessions", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password }),
	});
	assert.equal(session.status, 200);
	const { token } = await session.json();
	assert.ok(token);
	const headers = {
		Authorization: `Bearer ${token}`,
	};
	const post = (path, body) =>
		request(path, {
			method: "POST",
			headers: { ...headers, "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});

	try {
		const providers = await (
			await request("/api/v1/providers", { headers })
		).json();
		assert.ok(
			providers.items.some(
				(provider) => provider.id === "icloud" && provider.discovery,
			),
		);
		const connection = await post("/api/v1/connections", {
			type: "ics",
			name: "Compose smoke",
			credentials: { url: "http://backend:4000/health" },
		});
		assert.equal(connection.status, 201);
		const connectionBody = await connection.json();
		assert.equal(connectionBody.credentials, undefined);
		const calendar = await post("/api/v1/calendar-imports", {
			connectionId: connectionBody.id,
			remoteId: "feed",
			name: "Compose smoke",
			syncInterval: 0,
		});
		assert.equal(calendar.status, 201);
		const subscription = await post(
			`/api/v1/calendars/${(await calendar.json()).id}/subscriptions`,
			{ ceiling: "full" },
		);
		assert.equal(subscription.status, 201);
		const feed = await subscription.json();
		assert.equal(
			new URL(feed.url).origin,
			new URL(base).origin,
			"Feed URLs must use the configured public origin",
		);
		const previewPage = await request("/shared");
		assert.equal(previewPage.status, 200);
		assert.equal(previewPage.headers.get("referrer-policy"), "no-referrer");
		const preview = () =>
			request("/api/v1/shared-calendar-previews", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token: new URL(feed.previewUrl).hash.slice(1),
					start: "2026-09-01T00:00:00Z",
					end: "2026-10-01T00:00:00Z",
				}),
			});
		const publicCalendar = await preview();
		assert.equal(publicCalendar.status, 200);
		assert.equal(publicCalendar.headers.get("cache-control"), "no-store");
		assert.equal((await publicCalendar.json()).name, "Compose smoke");
		const delivered = await fetch(feed.url);
		assert.equal(delivered.status, 200);
		assert.match(await delivered.text(), /BEGIN:VCALENDAR/);
		assert.equal(
			(
				await request(`/api/v1/subscriptions/${feed.id}`, {
					method: "DELETE",
					headers,
				})
			).status,
			204,
		);
		assert.equal((await fetch(feed.url)).status, 404);
		assert.equal((await preview()).status, 404);
	} finally {
		assert.equal(
			(
				await request("/api/v1/me", {
					method: "DELETE",
					headers: { ...headers, "Content-Type": "application/json" },
					body: JSON.stringify({ password }),
				})
			).status,
			204,
		);
	}
}

console.log(
	"Compose smoke passed: frontend, API proxy, authentication, contracts and feed proxy.",
);
