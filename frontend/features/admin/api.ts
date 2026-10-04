import * as client from "../../lib/generated/client";

export const adminApi = {
	stats: client.adminStats,
	deleteUser: (id: string) => client.deleteAdminUser({ id }),
	resetFactor: (id: string) => client.adminResetTwoFactor({ id }),
	emailJobs: (input: client.adminEmailJobsInput = {}) =>
		client.adminEmailJobs({ limit: 25, ...input }),
	clearEmailJobs: client.clearEmailJobs,
	resetPassword: (id: string) => client.adminRequestPasswordReset({ id }),
	clearLogs: client.clearSyncLogs,
	users: (input: client.adminUsersInput) =>
		client.adminUsers({ limit: 25, ...input }),
	updateUser: (id: string, body: client.updateAdminUserInput["body"]) =>
		client.updateAdminUser({ id, body }),
	logs: (input: client.adminSyncRunsInput) =>
		client.adminSyncRuns({ limit: 25, ...input }),
	settings: client.adminSettings,
	saveSettings: (body: client.updateAdminSettingsInput["body"]) =>
		client.updateAdminSettings({ body }),
};
