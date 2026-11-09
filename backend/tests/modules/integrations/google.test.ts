import { afterEach, expect, it, vi } from "vitest";
import {
	googleDiscover,
	googleFetch,
} from "../../../src/modules/integrations/adapters/google";

afterEach(() => vi.unstubAllGlobals());

it("preserves Google discovery pagination, remote identities, names, and colors", async () => {
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(
			Response.json({
				items: [
					{
						id: "work@example.test",
						summary: "Work",
						backgroundColor: "#123456",
					},
				],
				nextPageToken: "next-page",
			}),
		)
		.mockResolvedValueOnce(
			Response.json({ items: [{ id: "personal", summary: "Personal" }] }),
		);

	vi.stubGlobal("fetch", fetch);

	expect(await googleDiscover({ accessToken: "access" })).toEqual([
		{ remoteId: "work@example.test", name: "Work", color: "#123456" },
		{ remoteId: "personal", name: "Personal", color: undefined },
	]);

	expect(new URL(fetch.mock.calls[1][0]).searchParams.get("pageToken")).toBe(
		"next-page",
	);
});

it("refreshes expired Google credentials and normalizes timed and all-day events across pages", async () => {
	const config = { accessToken: "expired", refreshToken: "refresh" };

	const fetch = vi
		.fn()
		.mockResolvedValueOnce(new Response(null, { status: 401 }))
		.mockResolvedValueOnce(Response.json({ access_token: "renewed" }))
		.mockResolvedValueOnce(
			Response.json({
				items: [
					{
						id: "timed",
						summary: "Planning",
						description: "Notes",
						location: "Room",
						start: { dateTime: "2026-10-24T13:00:00+02:00" },
						end: { dateTime: "2026-10-24T14:00:00+02:00" },
					},
				],
				nextPageToken: "page-two",
			}),
		)
		.mockResolvedValueOnce(
			Response.json({
				items: [
					{
						id: "all-day",
						transparency: "transparent",
						start: { date: "2026-10-25" },
						end: { date: "2026-10-26" },
					},
					{ id: "cancelled", status: "cancelled" },
				],
			}),
		);

	vi.stubGlobal("fetch", fetch);

	const window = {
		start: new Date("2026-10-01"),
		end: new Date("2026-11-01"),
		pastDays: 0,
		futureDays: 31,
	};

	const events = await googleFetch(config, "work@example.test", window);
	expect(config.accessToken).toBe("renewed");
	expect(fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer renewed");

	expect(new URL(fetch.mock.calls[2][0]).searchParams.get("timeMin")).toBe(
		window.start.toISOString(),
	);

	expect(new URL(fetch.mock.calls[3][0]).searchParams.get("pageToken")).toBe(
		"page-two",
	);

	expect(events).toMatchObject([
		{
			externalId: "timed",
			title: "Planning",
			description: "Notes",
			location: "Room",
			startTime: new Date("2026-10-24T11:00:00Z"),
			allDay: false,
			blocksTime: true,
		},
		{
			externalId: "all-day",
			title: "Untitled",
			startTime: new Date("2026-10-25"),
			endTime: new Date("2026-10-26"),
			allDay: true,
			blocksTime: false,
		},
	]);
});

it("rejects failed later pages rather than returning a partial Google snapshot", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({ items: [], nextPageToken: "page-two" }),
			)
			.mockResolvedValueOnce(new Response(null, { status: 503 })),
	);

	await expect(
		googleFetch({ accessToken: "access" }, "calendar"),
	).rejects.toThrow("PROVIDER_UNAVAILABLE");
});
