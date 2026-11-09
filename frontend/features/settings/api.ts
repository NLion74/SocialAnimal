import * as client from "../../lib/generated/client";

export const settingsApi = {
	public: client.publicSettings,
	admin: client.adminSettings,
	save: (body: client.updateAdminSettingsInput["body"]) =>
		client.updateAdminSettings({ body }),
	invite: client.createInvitation,
};
