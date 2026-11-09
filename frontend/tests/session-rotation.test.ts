import { it, expect, vi } from "vitest";
import { ApiClient } from "../lib/api";

it("does not clear a new session after a late response for the old token", async () => {
	const client = new ApiClient();
	client.setToken("old");
	let resolve!: (response: Response) => void;
	vi.stubGlobal(
		"fetch",
		vi.fn(
			() =>
				new Promise<Response>((done) => {
					resolve = done;
				}),
		),
	);
	const pending = client
		.get("/api/v1/me/notifications")
		.catch((error) => error);
	client.setToken("new");
	resolve(
		new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
			status: 401,
		}),
	);
	await pending;
	expect(client.getToken()).toBe("new");
	vi.unstubAllGlobals();
});

it("waits for enrollment to replace the session before handling a background 401", async () => {
	const client = new ApiClient();
	client.setToken("old");
	let finish!: (value: { token: string }) => void;
	const rotation = client.rotateSession(
		() =>
			new Promise<{ token: string }>((resolve) => {
				finish = resolve;
			}),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(JSON.stringify({ code: "UNAUTHENTICATED" }), {
					status: 401,
				}),
		),
	);
	const background = client
		.get("/api/v1/me/notifications")
		.catch((error) => error);
	await Promise.resolve();
	expect(client.getToken()).toBe("old");
	finish({ token: "new" });
	await rotation;
	await background;
	expect(client.getToken()).toBe("new");
	vi.unstubAllGlobals();
});
