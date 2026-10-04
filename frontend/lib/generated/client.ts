// Generated from backend runtime schemas. Run npm run client:generate in backend.
import { apiClient } from "../api";
export type PermissionCondition =
	| {
			attribute: string;
			operator: string;
			value: string | number | Array<string | number>;
	  }
	| { all: Array<PermissionCondition> }
	| { any: Array<PermissionCondition> }
	| { not: PermissionCondition };
export type deleteAdminUserInput = { id: string };

export type deleteAdminUserResponse = void;

export function deleteAdminUser(
	input: deleteAdminUserInput,
): Promise<deleteAdminUserResponse> {
	let path = "/api/v1/admin/users/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type updateAdminUserInput = {
	id: string;
	body: {
		accountRole?: "admin" | "moderator" | "normal" | "readonly";
		disabled?: boolean;
		emailVerified?: boolean;
	};
};

export type updateAdminUserResponse = {
	id: string;
	email: string;
	name: null | string;
	accountRole: "admin" | "moderator" | "normal" | "readonly";
	disabled: boolean;
	emailVerifiedAt: null | string;
	createdAt: string;
	calendarCount: number;
};

export function updateAdminUser(
	input: updateAdminUserInput,
): Promise<updateAdminUserResponse> {
	let path = "/api/v1/admin/users/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PATCH",
		body: input.body,
	});
}

export type adminResetTwoFactorInput = { id: string };

export type adminResetTwoFactorResponse = { ok: boolean };

export function adminResetTwoFactor(
	input: adminResetTwoFactorInput,
): Promise<adminResetTwoFactorResponse> {
	let path = "/api/v1/admin/users/{id}/two-factor-resets";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
	});
}

export type adminEmailJobsInput = {
	limit?: number;
	cursor?: string;
	status?:
		| "queued"
		| "running"
		| "retrying"
		| "sent"
		| "failed"
		| "expired"
		| "cancelled";
};

export type adminEmailJobsResponse = {
	items: Array<{
		id: string;
		kind: string;
		status: string;
		attempts: number;
		createdAt: string;
		finishedAt: null | string;
		lastError: null | string;
	}>;
	nextCursor: null | string;
	counts: { [key: string]: number };
};

export function adminEmailJobs(
	input: adminEmailJobsInput = {},
): Promise<adminEmailJobsResponse> {
	let path = "/api/v1/admin/email-jobs";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	if (input.status !== undefined) query.set("status", String(input.status));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type clearEmailJobsInput = {};

export type clearEmailJobsResponse = { deletedLogs: number };

export function clearEmailJobs(
	_input: clearEmailJobsInput = {},
): Promise<clearEmailJobsResponse> {
	let path = "/api/v1/admin/email-jobs";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type adminRequestPasswordResetInput = { id: string };

export type adminRequestPasswordResetResponse = { accepted: boolean };

export function adminRequestPasswordReset(
	input: adminRequestPasswordResetInput,
): Promise<adminRequestPasswordResetResponse> {
	let path = "/api/v1/admin/users/{id}/password-reset-requests";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
	});
}

export type adminStatsInput = {};

export type adminStatsResponse = {
	users: number;
	calendars: number;
	events: number;
	connections: number;
	activeSyncs: number;
	failedSyncsToday: number;
};

export function adminStats(
	_input: adminStatsInput = {},
): Promise<adminStatsResponse> {
	let path = "/api/v1/admin/stats";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type adminUsersInput = {
	limit?: number;
	cursor?: string;
	query?: string;
};

export type adminUsersResponse = {
	items: Array<{
		id: string;
		email: string;
		name: null | string;
		accountRole: "admin" | "moderator" | "normal" | "readonly";
		disabled: boolean;
		emailVerifiedAt: null | string;
		createdAt: string;
		calendarCount: number;
	}>;
	nextCursor: null | string;
};

export function adminUsers(
	input: adminUsersInput = {},
): Promise<adminUsersResponse> {
	let path = "/api/v1/admin/users";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	if (input.query !== undefined) query.set("query", String(input.query));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type clearSyncLogsInput = {};

export type clearSyncLogsResponse = {
	deletedLogs: number;
	clearedErrors: number;
};

export function clearSyncLogs(
	_input: clearSyncLogsInput = {},
): Promise<clearSyncLogsResponse> {
	let path = "/api/v1/admin/sync-runs";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type adminSyncRunsInput = {
	limit?: number;
	cursor?: string;
	status?: "queued" | "running" | "succeeded" | "failed";
};

export type adminSyncRunsResponse = {
	items: Array<{
		id: string;
		calendarId: string;
		calendarName: string;
		ownerEmail: string;
		status: string;
		createdAt: string;
		startedAt: null | string;
		finishedAt: null | string;
		error: null | string;
		eventsSynced: null | number;
	}>;
	nextCursor: null | string;
};

export function adminSyncRuns(
	input: adminSyncRunsInput = {},
): Promise<adminSyncRunsResponse> {
	let path = "/api/v1/admin/sync-runs";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	if (input.status !== undefined) query.set("status", String(input.status));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type completeLoginChallengeInput = {
	body: { challenge: string; code: string };
};

export type completeLoginChallengeResponse = {
	token?: string;
	user?: {
		id: string;
		email: string;
		name: null | string;
		isAdmin: boolean;
		accountRole?: "admin" | "moderator" | "normal" | "readonly";
		emailVerifiedAt?: null | string;
		createdAt?: string;
	};
	state?: string;
	challenge?: string;
	method?: string;
	expiresAt?: string;
	recoveryCodes?: Array<string>;
};

export function completeLoginChallenge(
	input: completeLoginChallengeInput,
): Promise<completeLoginChallengeResponse> {
	let path = "/api/v1/auth/challenge-completions";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type mySecurityInput = {};

export type mySecurityResponse = {
	method: string;
	required: boolean;
	setupRequired: boolean;
};

export function mySecurity(
	_input: mySecurityInput = {},
): Promise<mySecurityResponse> {
	let path = "/api/v1/me/security";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type beginTwoFactorEnrollmentInput = {
	body: { method: "email" | "totp" };
};

export type beginTwoFactorEnrollmentResponse = {
	challenge: string;
	method: string;
	expiresAt: string;
	secret?: string;
	uri?: string;
};

export function beginTwoFactorEnrollment(
	input: beginTwoFactorEnrollmentInput,
): Promise<beginTwoFactorEnrollmentResponse> {
	let path = "/api/v1/me/two-factor-enrollments";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type completeTwoFactorEnrollmentInput = {
	body: { challenge: string; code: string };
};

export type completeTwoFactorEnrollmentResponse = {
	token?: string;
	user?: {
		id: string;
		email: string;
		name: null | string;
		isAdmin: boolean;
		accountRole?: "admin" | "moderator" | "normal" | "readonly";
		emailVerifiedAt?: null | string;
		createdAt?: string;
	};
	state?: string;
	challenge?: string;
	method?: string;
	expiresAt?: string;
	recoveryCodes?: Array<string>;
};

export function completeTwoFactorEnrollment(
	input: completeTwoFactorEnrollmentInput,
): Promise<completeTwoFactorEnrollmentResponse> {
	let path = "/api/v1/me/two-factor-enrollment-completions";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type disableTwoFactorInput = {};

export type disableTwoFactorResponse = { ok: boolean };

export function disableTwoFactor(
	_input: disableTwoFactorInput = {},
): Promise<disableTwoFactorResponse> {
	let path = "/api/v1/me/two-factor";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type requestPasswordResetInput = { body: { email: string } };

export type requestPasswordResetResponse = { accepted: boolean };

export function requestPasswordReset(
	input: requestPasswordResetInput,
): Promise<requestPasswordResetResponse> {
	let path = "/api/v1/auth/password-reset-requests";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type resetPasswordInput = { body: { token: string; password: string } };

export type resetPasswordResponse = { ok: boolean };

export function resetPassword(
	input: resetPasswordInput,
): Promise<resetPasswordResponse> {
	let path = "/api/v1/auth/password-resets";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type requestEmailVerificationInput = {};

export type requestEmailVerificationResponse = { accepted: boolean };

export function requestEmailVerification(
	_input: requestEmailVerificationInput = {},
): Promise<requestEmailVerificationResponse> {
	let path = "/api/v1/me/email-verification-requests";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
	});
}

export type confirmEmailVerificationInput = { body: { token: string } };

export type confirmEmailVerificationResponse = { verified: boolean };

export function confirmEmailVerification(
	input: confirmEmailVerificationInput,
): Promise<confirmEmailVerificationResponse> {
	let path = "/api/v1/auth/email-verifications";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

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
	accountRole?: "admin" | "moderator" | "normal" | "readonly";
	emailVerifiedAt?: null | string;
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

export type loginInput = {
	body: { recovery?: boolean; email: string; password: string };
};

export type loginResponse = {
	token?: string;
	user?: {
		id: string;
		email: string;
		name: null | string;
		isAdmin: boolean;
		accountRole?: "admin" | "moderator" | "normal" | "readonly";
		emailVerifiedAt?: null | string;
		createdAt?: string;
	};
	state?: string;
	challenge?: string;
	method?: string;
	expiresAt?: string;
	recoveryCodes?: Array<string>;
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
	securitySetupRequired: boolean;
	twoFactorMethod: string;
	id: string;
	email: string;
	name: null | string;
	isAdmin: boolean;
	accountRole: "admin" | "moderator" | "normal" | "readonly";
	emailVerifiedAt: null | string;
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
	securitySetupRequired: boolean;
	twoFactorMethod: string;
	id: string;
	email: string;
	name: null | string;
	isAdmin: boolean;
	accountRole: "admin" | "moderator" | "normal" | "readonly";
	emailVerifiedAt: null | string;
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

export type invitationsInput = { limit?: number; cursor?: string };

export type invitationsResponse = {
	items: Array<{
		id: string;
		label: null | string;
		code: null | string;
		registrationUrl: null | string;
		createdAt: string;
		expiresAt: null | string;
		revokedAt: null | string;
		usedAt: null | string;
		status: "active" | "used" | "expired" | "revoked";
	}>;
	nextCursor: null | string;
};

export function invitations(
	input: invitationsInput = {},
): Promise<invitationsResponse> {
	let path = "/api/v1/invitations";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type createInvitationInput = {
	body: { label?: string; expiresAt?: string | null };
};

export type createInvitationResponse = {
	id: string;
	label: null | string;
	code: null | string;
	registrationUrl: null | string;
	createdAt: string;
	expiresAt: null | string;
	revokedAt: null | string;
	usedAt: null | string;
	status: "active" | "used" | "expired" | "revoked";
};

export function createInvitation(
	input: createInvitationInput,
): Promise<createInvitationResponse> {
	let path = "/api/v1/invitations";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type revokeInvitationInput = { id: string };

export type revokeInvitationResponse = void;

export function revokeInvitation(
	input: revokeInvitationInput,
): Promise<revokeInvitationResponse> {
	let path = "/api/v1/invitations/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type publicSettingsInput = {};

export type publicSettingsResponse = {
	registrationsOpen: boolean;
	inviteOnly: boolean;
	requireEmailVerification: boolean;
	requireTwoFactor: boolean;
	maxCalendarsPerUser: number;
	minSyncIntervalMinutes: number;
	syncPastDays: number;
	syncFutureDays: number;
	defaultTimezone: string;
	defaultFirstDayOfWeek: "monday" | "sunday";
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
	requireEmailVerification: boolean;
	requireTwoFactor: boolean;
	maxCalendarsPerUser: number;
	minSyncIntervalMinutes: number;
	syncPastDays: number;
	syncFutureDays: number;
	defaultTimezone: string;
	defaultFirstDayOfWeek: "monday" | "sunday";
	smtpConfigured: boolean;
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
	body: {
		registrationsOpen?: boolean;
		inviteOnly?: boolean;
		requireEmailVerification?: boolean;
		requireTwoFactor?: boolean;
		maxCalendarsPerUser?: number;
		minSyncIntervalMinutes?: number;
		syncPastDays?: number;
		syncFutureDays?: number;
		defaultTimezone?: string;
		defaultFirstDayOfWeek?: "monday" | "sunday";
	};
};

export type updateAdminSettingsResponse = {
	registrationsOpen: boolean;
	inviteOnly: boolean;
	requireEmailVerification: boolean;
	requireTwoFactor: boolean;
	maxCalendarsPerUser: number;
	minSyncIntervalMinutes: number;
	syncPastDays: number;
	syncFutureDays: number;
	defaultTimezone: string;
	defaultFirstDayOfWeek: "monday" | "sunday";
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
		sharedCalendarExpirations?: { [key: string]: null | string };
		sharedCalendarRulesets?: { [key: string]: string };
		sharedCalendarPermissions?: {
			[key: string]: "busy" | "titles" | "full";
		};
		sharedWithMe?: Array<{
			id: string;
			name: string;
			permission: "busy" | "titles" | "full";
			accessLabel: string;
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
	sharedCalendarExpirations?: { [key: string]: null | string };
	sharedCalendarRulesets?: { [key: string]: string };
	sharedCalendarPermissions?: { [key: string]: "busy" | "titles" | "full" };
	sharedWithMe?: Array<{
		id: string;
		name: string;
		permission: "busy" | "titles" | "full";
		accessLabel: string;
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
	sharedCalendarExpirations?: { [key: string]: null | string };
	sharedCalendarRulesets?: { [key: string]: string };
	sharedCalendarPermissions?: { [key: string]: "busy" | "titles" | "full" };
	sharedWithMe?: Array<{
		id: string;
		name: string;
		permission: "busy" | "titles" | "full";
		accessLabel: string;
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

export type permissionRegistryInput = {};

export type permissionRegistryResponse = {
	attributes: Array<{
		id: string;
		label: string;
		type: "string" | "number" | "date" | "time" | "day";
		source: string;
		choices?: Array<string>;
	}>;
	operators: {
		string: Array<string>;
		number: Array<string>;
		date: Array<string>;
		time: Array<string>;
		day: Array<string>;
	};
	limits: {
		rulesets: number;
		rules: number;
		depth: number;
		nodes: number;
		children: number;
		text: number;
		regex: number;
		cache: number;
		intervalDays: number;
		evaluationPoints: number;
	};
};

export function permissionRegistry(
	_input: permissionRegistryInput = {},
): Promise<permissionRegistryResponse> {
	let path = "/api/v1/permission-registry";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type rulesetsInput = { limit?: number; cursor?: string };

export type rulesetsResponse = {
	items: Array<{
		id: string;
		name: string;
		fallback: "hidden" | "busy" | "titles" | "full";
		rules: Array<{
			when: PermissionCondition;
			visibility: "hidden" | "busy" | "titles" | "full";
		}>;
		version: number;
		seedKey: null | string;
		updatedAt: string;
	}>;
	nextCursor: null | string;
};

export function rulesets(input: rulesetsInput = {}): Promise<rulesetsResponse> {
	let path = "/api/v1/rulesets";
	const query = new URLSearchParams();
	if (input.limit !== undefined) query.set("limit", String(input.limit));
	if (input.cursor !== undefined) query.set("cursor", String(input.cursor));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "GET",
	});
}

export type createRulesetInput = {
	body: {
		name: string;
		fallback: "hidden" | "busy" | "titles" | "full";
		rules: Array<{
			when: PermissionCondition;
			visibility: "hidden" | "busy" | "titles" | "full";
		}>;
	};
};

export type createRulesetResponse = {
	id: string;
	name: string;
	fallback: "hidden" | "busy" | "titles" | "full";
	rules: Array<{
		when: PermissionCondition;
		visibility: "hidden" | "busy" | "titles" | "full";
	}>;
	version: number;
	seedKey: null | string;
	updatedAt: string;
};

export function createRuleset(
	input: createRulesetInput,
): Promise<createRulesetResponse> {
	let path = "/api/v1/rulesets";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type updateRulesetInput = {
	id: string;
	body: {
		name: string;
		fallback: "hidden" | "busy" | "titles" | "full";
		rules: Array<{
			when: PermissionCondition;
			visibility: "hidden" | "busy" | "titles" | "full";
		}>;
		version: number;
	};
};

export type updateRulesetResponse = {
	id: string;
	name: string;
	fallback: "hidden" | "busy" | "titles" | "full";
	rules: Array<{
		when: PermissionCondition;
		visibility: "hidden" | "busy" | "titles" | "full";
	}>;
	version: number;
	seedKey: null | string;
	updatedAt: string;
};

export function updateRuleset(
	input: updateRulesetInput,
): Promise<updateRulesetResponse> {
	let path = "/api/v1/rulesets/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PUT",
		body: input.body,
	});
}

export type deleteRulesetInput = { id: string };

export type deleteRulesetResponse = void;

export function deleteRuleset(
	input: deleteRulesetInput,
): Promise<deleteRulesetResponse> {
	let path = "/api/v1/rulesets/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type previewGrantInput = {
	id: string;
	userId: string;
	body: {
		rulesetId: string;
		start: string;
		end: string;
		limit?: number;
		cursor?: string;
	};
};

export type previewGrantResponse = {
	items: Array<{
		explanation: {
			visibility: "hidden" | "busy" | "titles" | "full";
			ruleIndex: null | number;
			reason: string;
			timezone: string;
			matchedAt: null | string;
			conditions: Array<{ path: string; label: string; result: string }>;
		};
		id: string;
		title: string;
		description: null | string;
		location: null | string;
		startTime: string;
		endTime: string;
		allDay: boolean;
		visibility: "hidden" | "busy" | "titles" | "full";
	}>;
	nextCursor: null | string;
};

export function previewGrant(
	input: previewGrantInput,
): Promise<previewGrantResponse> {
	let path = "/api/v1/calendars/{id}/grants/{userId}/previews";
	path = path.replace("{id}", encodeURIComponent(input.id));
	path = path.replace("{userId}", encodeURIComponent(input.userId));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}

export type setGrantInput = {
	id: string;
	userId: string;
	body: { rulesetId: string; expiresAt?: string | null };
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
		expiresAt: null | string;
		name: string;
		rulesetId: null | string;
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
	body: {
		ceiling?: "busy" | "titles" | "full";
		replaceId?: string;
		name?: string;
		rulesetId?: string;
		expiresAt?: string | null;
	};
};

export type createSubscriptionResponse = {
	expiresAt: null | string;
	name: string;
	rulesetId: null | string;
	id: string;
	calendarId: string;
	ceiling: "busy" | "titles" | "full";
	createdAt: string;
	revokedAt: null | string;
	url: string;
	previewUrl: string;
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

export type updateSubscriptionInput = {
	id: string;
	body: { name?: string; rulesetId?: string; expiresAt?: string | null };
};

export type updateSubscriptionResponse = {
	expiresAt: null | string;
	name: string;
	rulesetId: null | string;
	id: string;
	calendarId: string;
	ceiling: "busy" | "titles" | "full";
	createdAt: string;
	revokedAt: null | string;
};

export function updateSubscription(
	input: updateSubscriptionInput,
): Promise<updateSubscriptionResponse> {
	let path = "/api/v1/subscriptions/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "PATCH",
		body: input.body,
	});
}

export type revokeSubscriptionInput = { id: string; permanent?: boolean };

export type revokeSubscriptionResponse = void;

export function revokeSubscription(
	input: revokeSubscriptionInput,
): Promise<revokeSubscriptionResponse> {
	let path = "/api/v1/subscriptions/{id}";
	path = path.replace("{id}", encodeURIComponent(input.id));
	const query = new URLSearchParams();
	if (input.permanent !== undefined)
		query.set("permanent", String(input.permanent));
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "DELETE",
	});
}

export type sharedCalendarPreviewInput = {
	body: {
		token: string;
		start: string;
		end: string;
		limit?: number;
		cursor?: string;
	};
};

export type sharedCalendarPreviewResponse = {
	name: string;
	timezone: string;
	firstDayOfWeek: "monday" | "sunday";
	accessRevision: string;
	permission: "busy" | "titles" | "full";
	items: Array<{
		id: string;
		title: string;
		description: null | string;
		location: null | string;
		startTime: string;
		endTime: string;
		allDay: boolean;
		visibility: "full" | "titles" | "busy";
	}>;
	nextCursor: null | string;
};

export function sharedCalendarPreview(
	input: sharedCalendarPreviewInput,
): Promise<sharedCalendarPreviewResponse> {
	let path = "/api/v1/shared-calendar-previews";
	const query = new URLSearchParams();
	return apiClient.request(path + (query.size ? "?" + query : ""), {
		method: "POST",
		body: input.body,
	});
}
