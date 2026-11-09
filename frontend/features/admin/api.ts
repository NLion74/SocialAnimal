import * as client from "../../lib/generated/client";

export const adminApi = {
	stats: client.adminStats,
	beginDeletion: (id: string, recovery = false) =>
		client.beginAdminAccountDeletion({ id, body: { recovery } }),
	deleteUser: (
		id: string,
		confirmation?: client.deleteMeInput["body"]["confirmation"],
	) => client.deleteAdminUser({ id, body: { confirmation } }),
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
