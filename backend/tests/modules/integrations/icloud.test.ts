import { afterEach, expect, it, vi } from "vitest";
import { createDAVClient } from "tsdav";
import { registry } from "../../../src/modules/integrations/adapters";

vi.mock("tsdav", () => ({ createDAVClient: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

it("discovers and synchronizes the selected Apple calendar using app-specific credentials", async () => {
	const remoteId = "https://p01-caldav.icloud.com/123/calendars/Work/";

	const fetchCalendarObjects = vi.fn().mockResolvedValue([
		{
			data: "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:apple-event\r\nSUMMARY:Apple meeting\r\nDTSTART:20260930T100000Z\r\nDTEND:20260930T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR",
		},
	]);

	vi.mocked(createDAVClient).mockResolvedValue({
		fetchCalendars: async () => [
			{
				url: "https://p01-caldav.icloud.com/123/calendars/Home/",
				displayName: "Home",
			},
			{ url: remoteId, displayName: "Work" },
		],
		fetchCalendarObjects,
	} as any);

	const credentials = {
		username: "apple@example.test",
		password: "app-specific-password",
	};

	expect(await registry.icloud.discover!(credentials)).toContainEqual({
		remoteId,
		name: "Work",
		color: undefined,
	});

	const result = await registry.icloud.fetch!(credentials, remoteId);

	expect(createDAVClient).toHaveBeenCalledWith(
		expect.objectContaining({
			serverUrl: "https://caldav.icloud.com",
			credentials,
			authMethod: "Basic",
		}),
	);

	expect(fetchCalendarObjects).toHaveBeenCalledWith(
		expect.objectContaining({
			calendar: expect.objectContaining({ url: remoteId }),
		}),
	);

	expect(result).toMatchObject({
		kind: "snapshot",
		complete: true,
		events: [{ externalId: "apple-event", title: "Apple meeting" }],
	});
});
