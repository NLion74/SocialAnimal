import * as client from "../../lib/generated/client";

export const accountApi = {
	login: (body: client.loginInput["body"]) => client.login({ body }),
	register: (body: client.registerInput["body"]) => client.register({ body }),
	me: async () => {
		const [user, settings] = await Promise.all([
			client.me(),
			client.mySettings(),
		]);

		return { ...user, settings };
	},
	save: async (
		body: client.updateMeInput["body"] &
			client.updateMySettingsInput["body"] &
			Partial<client.changePasswordInput["body"]>,
	) => {
		if (body.newPassword)
			await client.changePassword({
				body: {
					currentPassword: body.currentPassword || "",
					newPassword: body.newPassword,
				},
			});

		await client.updateMe({ body: { name: body.name } });

		await client.updateMySettings({
			body: {
				firstDayOfWeek: body.firstDayOfWeek,
				timezone: body.timezone,
				defaultTab: body.defaultTab,
			},
		});
	},
	remove: (password: string) => client.deleteMe({ body: { password } }),
};
