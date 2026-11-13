import { afterEach, expect, it, vi } from "vitest";
import { integrationFlows } from "../features/integrations/flows";
import { integrationsApi } from "../features/integrations/api";
import { accountApi } from "../features/account/api";
import { friendsApi } from "../features/friends/api";
import { sharingApi } from "../features/sharing/api";
import { adminApi } from "../features/admin/api";

afterEach(() => vi.unstubAllGlobals());

it("provider, account, friendship, sharing and admin actions issue only v1 requests", async () => {
	const requests: string[] = [];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: string) => {
			requests.push(input);
			return Response.json({
				id: "connection",
				url: "https://accounts.google.com",
				items: [{ id: "connection", remoteId: "work", name: "Work" }],
				nextCursor: null,
			});
		}),
	);
	await integrationsApi.authorizeGoogle();
	await integrationFlows.googleDiscovery("flow");
	for (const provider of ["caldav", "icloud"] as const) {
		const { connection, calendars } = await integrationFlows.connectServer(
			provider,
			"Work",
			{
				url: "https://dav.example",
				username: "person",
				password: "test",
			},
		);
		await integrationFlows.importSelection(connection.id, calendars, 0);
	}
	await integrationFlows.saveFeed({
		name: "Feed",
		credentials: { url: "https://feed.example/calendar.ics" },
		syncInterval: 0,
	});
	await accountApi.me();
	await accountApi.save({
		name: "Person",
		timezone: "UTC",
		currentPassword: "old",
		newPassword: "new",
	});
	await accountApi.beginEnrollment("totp");
	await accountApi.requestPasswordReset("person@example.test");
	await friendsApi.list();
	await friendsApi.search("Person");
	await friendsApi.request({ targetUserId: "friend" });
	await friendsApi.accept("friendship");
	await friendsApi.remove("friendship");
	await sharingApi.set({
		calendarId: "calendar",
		friendId: "friend",
		share: true,
		rulesetId: "rules",
	});
	await sharingApi.set({
		calendarId: "calendar",
		friendId: "friend",
		share: false,
		rulesetId: "rules",
	});
	await sharingApi.list("calendar");
	await adminApi.settings();
	await adminApi.saveSettings({
		minSyncIntervalMinutes: 2,
		syncConcurrency: 4,
	});
	await adminApi.users({});
	await adminApi.updateUser("user", { disabled: true });
	await adminApi.logs({});
	await adminApi.emailJobs();
	expect(requests.length).toBeGreaterThan(25);
	expect(requests.every((url) => url.startsWith("/api/v1/"))).toBe(true);
});
