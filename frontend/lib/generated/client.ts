// Generated from backend runtime schemas. Run npm run client:generate in backend.
import { apiClient } from "../api";
export type registerInput = {
	body: {
		email: string;
		password: string;
		name?: string;
		inviteCode?: string;
	};
};

export type registerResponse = {
	id: string;
	email: string;
	name: null | string;
	isAdmin: boolean;
	createdAt?: string;
};

export function register(input: registerInput): Promise<registerResponse> {
	let path = "/api/v1/auth/registrations";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type loginInput = { body: { email: string; password: string } };

export type loginResponse = {
	token: string;
	user: {
		id: string;
		email: string;
		name: null | string;
		isAdmin: boolean;
		createdAt?: string;
	};
};

export function login(input: loginInput): Promise<loginResponse> {
	let path = "/api/v1/auth/sessions";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type meInput = {};

export type meResponse = {
	id: string;
	email: string;
	name: null | string;
	isAdmin: boolean;
	createdAt: string;
};

export function me(_input: meInput = {}): Promise<meResponse> {
	let path = "/api/v1/me";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type updateMeInput = { body: { name?: string } };

export type updateMeResponse = {
	id: string;
	email: string;
	name: null | string;
	isAdmin: boolean;
	createdAt: string;
};

export function updateMe(input: updateMeInput): Promise<updateMeResponse> {
	let path = "/api/v1/me";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PATCH",
		body: input.body,
	});
}

export type deleteMeInput = { body: { password: string } };

export type deleteMeResponse = void;

export function deleteMe(input: deleteMeInput): Promise<deleteMeResponse> {
	let path = "/api/v1/me";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
		body: input.body,
	});
}

export type changePasswordInput = {
	body: { currentPassword: string; newPassword: string };
};

export type changePasswordResponse = { ok: boolean };

export function changePassword(
	input: changePasswordInput,
): Promise<changePasswordResponse> {
	let path = "/api/v1/me/password";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PUT",
		body: input.body,
	});
}

export type createInvitationInput = {};

export type createInvitationResponse = { id: string; code: string };

export function createInvitation(
	_input: createInvitationInput = {},
): Promise<createInvitationResponse> {
	let path = "/api/v1/invitations";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
	});
}

export type publicSettingsInput = {};

export type publicSettingsResponse = {
	registrationsOpen: boolean;
	inviteOnly: boolean;
};

export function publicSettings(
	_input: publicSettingsInput = {},
): Promise<publicSettingsResponse> {
	let path = "/api/v1/settings/public";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type adminSettingsInput = {};

export type adminSettingsResponse = {
	registrationsOpen: boolean;
	inviteOnly: boolean;
};

export function adminSettings(
	_input: adminSettingsInput = {},
): Promise<adminSettingsResponse> {
	let path = "/api/v1/admin/settings";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type updateAdminSettingsInput = {
	body: { registrationsOpen?: boolean; inviteOnly?: boolean };
};

export type updateAdminSettingsResponse = {
	registrationsOpen: boolean;
	inviteOnly: boolean;
};

export function updateAdminSettings(
	input: updateAdminSettingsInput,
): Promise<updateAdminSettingsResponse> {
	let path = "/api/v1/admin/settings";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PATCH",
		body: input.body,
	});
}

export type mySettingsInput = {};

export type mySettingsResponse = {
	firstDayOfWeek: "monday" | "sunday";
	timezone: string;
	defaultTab: "dashboard" | "calendar" | "friends" | "profile";
};

export function mySettings(
	_input: mySettingsInput = {},
): Promise<mySettingsResponse> {
	let path = "/api/v1/me/settings";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type updateMySettingsInput = {
	body: {
		firstDayOfWeek?: "monday" | "sunday";
		timezone?: string;
		defaultTab?: "dashboard" | "calendar" | "friends" | "profile";
	};
};

export type updateMySettingsResponse = {
	firstDayOfWeek: "monday" | "sunday";
	timezone: string;
	defaultTab: "dashboard" | "calendar" | "friends" | "profile";
};

export function updateMySettings(
	input: updateMySettingsInput,
): Promise<updateMySettingsResponse> {
	let path = "/api/v1/me/settings";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PATCH",
		body: input.body,
	});
}

export type searchUsersInput = {
	limit?: number;
	cursor?: string;
	query: string;
};

export type searchUsersResponse = {
	items: Array<{ id: string; email: string; name: null | string }>;
	nextCursor: null | string;
};

export function searchUsers(
	input: searchUsersInput,
): Promise<searchUsersResponse> {
	let path = "/api/v1/users";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	if (input.query !== undefined) query.set("query", String(input.query));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type friendshipsInput = { limit?: number; cursor?: string };

export type friendshipsResponse = {
	items: Array<{
		id: string;
		user1: { id: string; email: string; name: null | string };
		user2: { id: string; email: string; name: null | string };
		status: string;
		sharedCalendarIds?: Array<string>;
		sharedCalendarPermissions?: {
			[key: string]: "busy" | "titles" | "full";
		};
		sharedWithMe?: Array<{
			id: string;
			name: string;
			permission: "busy" | "titles" | "full";
		}>;
	}>;
	nextCursor: null | string;
};

export function friendships(
	input: friendshipsInput = {},
): Promise<friendshipsResponse> {
	let path = "/api/v1/friendships";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type requestFriendshipInput = {
	body: { targetUserId?: string; identifier?: string };
};

export type requestFriendshipResponse = {
	id: string;
	user1: { id: string; email: string; name: null | string };
	user2: { id: string; email: string; name: null | string };
	status: string;
	sharedCalendarIds?: Array<string>;
	sharedCalendarPermissions?: { [key: string]: "busy" | "titles" | "full" };
	sharedWithMe?: Array<{
		id: string;
		name: string;
		permission: "busy" | "titles" | "full";
	}>;
};

export function requestFriendship(
	input: requestFriendshipInput,
): Promise<requestFriendshipResponse> {
	let path = "/api/v1/friendships";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type acceptFriendshipInput = {
	id: string;
	body: { status: "accepted" };
};

export type acceptFriendshipResponse = {
	id: string;
	user1: { id: string; email: string; name: null | string };
	user2: { id: string; email: string; name: null | string };
	status: string;
	sharedCalendarIds?: Array<string>;
	sharedCalendarPermissions?: { [key: string]: "busy" | "titles" | "full" };
	sharedWithMe?: Array<{
		id: string;
		name: string;
		permission: "busy" | "titles" | "full";
	}>;
};

export function acceptFriendship(
	input: acceptFriendshipInput,
): Promise<acceptFriendshipResponse> {
	let path = "/api/v1/friendships/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PATCH",
		body: input.body,
	});
}

export type removeFriendshipInput = { id: string };

export type removeFriendshipResponse = void;

export function removeFriendship(
	input: removeFriendshipInput,
): Promise<removeFriendshipResponse> {
	let path = "/api/v1/friendships/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type calendarsInput = { limit?: number; cursor?: string };

export type calendarsResponse = {
	items: Array<{
		id: string;
		name: string;
		type: string;
		connectionId?: null | string;
		remoteId?: null | string;
		syncInterval: number;
		eventCount?: number;
		lastSync?: null | string;
		lastAttempt?: null | string;
		lastSuccess?: null | string;
		lastError?: null | string;
	}>;
	nextCursor: null | string;
};

export function calendars(
	input: calendarsInput = {},
): Promise<calendarsResponse> {
	let path = "/api/v1/calendars";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type updateCalendarInput = {
	id: string;
	body: { name?: string; syncInterval?: number };
};

export type updateCalendarResponse = {
	id: string;
	name: string;
	type: string;
	connectionId?: null | string;
	remoteId?: null | string;
	syncInterval: number;
	eventCount?: number;
	lastSync?: null | string;
	lastAttempt?: null | string;
	lastSuccess?: null | string;
	lastError?: null | string;
};

export function updateCalendar(
	input: updateCalendarInput,
): Promise<updateCalendarResponse> {
	let path = "/api/v1/calendars/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PATCH",
		body: input.body,
	});
}

export type deleteCalendarInput = { id: string };

export type deleteCalendarResponse = void;

export function deleteCalendar(
	input: deleteCalendarInput,
): Promise<deleteCalendarResponse> {
	let path = "/api/v1/calendars/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type eventsInput = {
	limit?: number;
	cursor?: string;
	start: string;
	end: string;
	calendarId?: string;
	scope?: "mine" | "shared" | "all";
};

export type eventsResponse = {
	items: Array<{
		id: string;
		calendarId: string;
		title: string;
		description: null | string;
		location: null | string;
		startTime: string;
		endTime: string;
		allDay: boolean;
		isFriend: boolean;
		calendar: { id: string; name: string; type: string };
		owner: { id: string; email: string; name: null | string };
	}>;
	nextCursor: null | string;
};

export function events(input: eventsInput): Promise<eventsResponse> {
	let path = "/api/v1/events";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	if (input.start !== undefined) query.set("start", String(input.start));
	if (input.end !== undefined) query.set("end", String(input.end));
	if (input.calendarId !== undefined)
		query.set("calendarId", String(input.calendarId));
	if (input.scope !== undefined) query.set("scope", String(input.scope));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type submitSyncInput = { id: string };

export type submitSyncResponse = {
	id: string;
	calendarId: string;
	status: string;
	eventsSynced?: null | number;
	error?: null | string;
	statusUrl?: string;
};

export function submitSync(
	input: submitSyncInput,
): Promise<submitSyncResponse> {
	let path = "/api/v1/calendars/{id}/sync-runs";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
	});
}

export type syncRunInput = { id: string };

export type syncRunResponse = {
	id: string;
	calendarId: string;
	status: string;
	eventsSynced?: null | number;
	error?: null | string;
	statusUrl?: string;
};

export function syncRun(input: syncRunInput): Promise<syncRunResponse> {
	let path = "/api/v1/sync-runs/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type providersInput = {};

export type providersResponse = {
	items: Array<{
		id: string;
		name: string;
		discovery: boolean;
		sync: boolean;
		test: boolean;
		oauth: boolean;
		import: boolean;
	}>;
	nextCursor: null | string;
};

export function providers(
	_input: providersInput = {},
): Promise<providersResponse> {
	let path = "/api/v1/providers";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type connectionsInput = {
	limit?: number;
	cursor?: string;
	flow?: string;
};

export type connectionsResponse = {
	items: Array<{
		id: string;
		name: string;
		type: string;
		hasCredentials: boolean;
	}>;
	nextCursor: null | string;
};

export function connections(
	input: connectionsInput = {},
): Promise<connectionsResponse> {
	let path = "/api/v1/connections";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	if (input.flow !== undefined) query.set("flow", String(input.flow));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type createConnectionInput = {
	body: {
		type: "ics" | "caldav" | "icloud" | "google";
		name: string;
		credentials: {
			url?: string;
			username?: string;
			password?: string;
			accessToken?: string;
			refreshToken?: string;
		};
	};
};

export type createConnectionResponse = {
	id: string;
	name: string;
	type: string;
	hasCredentials: boolean;
};

export function createConnection(
	input: createConnectionInput,
): Promise<createConnectionResponse> {
	let path = "/api/v1/connections";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type updateConnectionInput = {
	id: string;
	body: {
		name?: string;
		credentials?: {
			url?: string;
			username?: string;
			password?: string;
			accessToken?: string;
			refreshToken?: string;
		};
	};
};

export type updateConnectionResponse = {
	id: string;
	name: string;
	type: string;
	hasCredentials: boolean;
};

export function updateConnection(
	input: updateConnectionInput,
): Promise<updateConnectionResponse> {
	let path = "/api/v1/connections/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PATCH",
		body: input.body,
	});
}

export type discoverConnectionInput = {
	id: string;
	limit?: number;
	cursor?: string;
};

export type discoverConnectionResponse = {
	items: Array<{
		id: string;
		remoteId: string;
		name: string;
		importedCalendarId: null | string;
		color?: string;
	}>;
	nextCursor: null | string;
};

export function discoverConnection(
	input: discoverConnectionInput,
): Promise<discoverConnectionResponse> {
	let path = "/api/v1/connections/{id}/discoveries";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
	});
}

export type testConnectionInput = { id: string };

export type testConnectionResponse = { success: boolean };

export function testConnection(
	input: testConnectionInput,
): Promise<testConnectionResponse> {
	let path = "/api/v1/connections/{id}/tests";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
	});
}

export type importCalendarInput = {
	body: {
		connectionId: string;
		remoteId: string;
		name: string;
		syncInterval?: number;
	};
};

export type importCalendarResponse = {
	id: string;
	name: string;
	type: string;
	connectionId?: null | string;
	remoteId?: null | string;
	syncInterval: number;
	eventCount?: number;
	lastSync?: null | string;
	lastAttempt?: null | string;
	lastSuccess?: null | string;
	lastError?: null | string;
};

export function importCalendar(
	input: importCalendarInput,
): Promise<importCalendarResponse> {
	let path = "/api/v1/calendar-imports";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type googleAuthorizationInput = {};

export type googleAuthorizationResponse = { url: string };

export function googleAuthorization(
	_input: googleAuthorizationInput = {},
): Promise<googleAuthorizationResponse> {
	let path = "/api/v1/connections/google/authorizations";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
	});
}

export type setGrantInput = {
	id: string;
	userId: string;
	body: { permission: "busy" | "titles" | "full" };
};

export type setGrantResponse = void;

export function setGrant(input: setGrantInput): Promise<setGrantResponse> {
	let path = "/api/v1/calendars/{id}/grants/{userId}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	path = path.replace("{userId}", encodeURIComponent(input.userId));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PUT",
		body: input.body,
	});
}

export type removeGrantInput = { id: string; userId: string };

export type removeGrantResponse = void;

export function removeGrant(
	input: removeGrantInput,
): Promise<removeGrantResponse> {
	let path = "/api/v1/calendars/{id}/grants/{userId}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	path = path.replace("{userId}", encodeURIComponent(input.userId));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type subscriptionsInput = {
	id: string;
	limit?: number;
	cursor?: string;
};

export type subscriptionsResponse = {
	items: Array<{
		id: string;
		calendarId: string;
		ceiling: "busy" | "titles" | "full";
		createdAt: string;
		revokedAt: null | string;
	}>;
	nextCursor: null | string;
};

export function subscriptions(
	input: subscriptionsInput,
): Promise<subscriptionsResponse> {
	let path = "/api/v1/calendars/{id}/subscriptions";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type createSubscriptionInput = {
	id: string;
	body: { ceiling: "busy" | "titles" | "full" };
};

export type createSubscriptionResponse = {
	id: string;
	calendarId: string;
	ceiling: "busy" | "titles" | "full";
	createdAt: string;
	revokedAt: null | string;
	url: string;
};

export function createSubscription(
	input: createSubscriptionInput,
): Promise<createSubscriptionResponse> {
	let path = "/api/v1/calendars/{id}/subscriptions";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type revokeSubscriptionInput = { id: string };

export type revokeSubscriptionResponse = void;

export function revokeSubscription(
	input: revokeSubscriptionInput,
): Promise<revokeSubscriptionResponse> {
	let path = "/api/v1/subscriptions/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}
