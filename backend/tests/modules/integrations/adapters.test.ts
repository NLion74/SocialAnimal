import { describe, it, expect, vi, afterEach } from "vitest";
import { IcsAdapter } from "../../../src/modules/integrations/adapters/ics";
import { CaldavAdapter } from "../../../src/modules/integrations/adapters/caldav";
import { createDAVClient } from "tsdav";

vi.mock("tsdav", () => ({ createDAVClient: vi.fn() }));

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

const make = (start: string, end: string, timezone = "") =>
	`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${timezone}BEGIN:VEVENT\r\nUID:event-1\r\nSUMMARY:Meeting\r\nDTSTART${start}\r\nDTEND${end}\r\nEND:VEVENT\r\nEND:VCALENDAR`;

for (const provider of ["ics", "caldav"])
	describe(`${provider} date compatibility`, () => {
		async function fetch(text: string) {
			if (provider === "ics") {
				vi.stubGlobal(
					"fetch",
					vi.fn().mockResolvedValue(new Response(text)),
				);

				return new IcsAdapter().fetchEvents({
					id: "feed",
					config: { url: "https://example.test/feed" },
					user: { settings: { timezone: "Europe/Berlin" } },
				});
			}

			vi.mocked(createDAVClient).mockResolvedValue({
				fetchCalendars: async () => [
					{ url: "https://example.test/calendar" },
				],
				fetchCalendarObjects: async () => [{ data: text }],
			} as any);

			return new CaldavAdapter().fetchEvents(
				{ url: "https://example.test/calendar" },
				"Europe/Berlin",
			);
		}

		it("preserves winter floating time conversion", async () =>
			expect(
				(
					await fetch(make(":20260115T100000", ":20260115T110000"))
				)[0].startTime.toISOString(),
			).toBe("2026-01-15T09:00:00.000Z"));

		it("preserves summer DST conversion", async () =>
			expect(
				(
					await fetch(make(":20260715T100000", ":20260715T110000"))
				)[0].startTime.toISOString(),
			).toBe("2026-07-15T08:00:00.000Z"));

		it("uses calendar timezone before user timezone", async () =>
			expect(
				(
					await fetch(
						make(
							":20260715T100000",
							":20260715T110000",
							"X-WR-TIMEZONE:Europe/London\r\n",
						),
					)
				)[0].startTime.toISOString(),
			).toBe("2026-07-15T09:00:00.000Z"));

		it("preserves all-day dates", async () => {
			const row = (
				await fetch(
					make(";VALUE=DATE:20260715", ";VALUE=DATE:20260716"),
				)
			)[0];

			expect(row.allDay).toBe(true);
			expect(row.startTime.getDate()).toBe(15);
		});

		it("accepts complete empty calendars", async () =>
			expect(
				await fetch("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR"),
			).toEqual([]));
	});

describe("snapshot safety", () => {
	it.each([
		"example.test/timetable/person",
		"  https://example.test/timetable/person  ",
		"WEBCAL://example.test/timetable/person",
	])(
		"accepts subscription addresses without an .ics suffix: %s",
		async (url) => {
			const request = vi
				.fn()
				.mockResolvedValue(
					new Response(
						make(":20260715T100000Z", ":20260715T110000Z"),
					),
				);

			vi.stubGlobal("fetch", request);

			const events = await new IcsAdapter().fetchEvents({
				id: "feed",
				config: { url },
			});

			expect(events).toHaveLength(1);

			expect(request.mock.calls[0][0]).toBe(
				"https://example.test/timetable/person",
			);
		},
	);

	it("does not downgrade an authenticated HTTPS request after a provider failure", async () => {
		const request = vi
			.fn()
			.mockResolvedValue(new Response("Unauthorized", { status: 401 }));

		vi.stubGlobal("fetch", request);

		await expect(
			new IcsAdapter().fetchEvents({
				id: "feed",
				config: {
					url: "https://example.test/feed",
					username: "user",
					password: "secret",
				},
			}),
		).rejects.toThrow("PROVIDER_AUTH_FAILED");

		expect(request).toHaveBeenCalledTimes(1);
		expect(request.mock.calls[0][0]).toBe("https://example.test/feed");
	});

	it("rejects truncated ICS instead of deleting previously imported events", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response("BEGIN:VCALENDAR\r\nVERSION:2.0"),
				),
		);

		await expect(
			new IcsAdapter().fetchEvents({
				id: "feed",
				config: { url: "https://example.test/feed" },
			}),
		).rejects.toThrow("PROVIDER_INVALID_CALENDAR");
	});
});
