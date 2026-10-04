import * as client from "../../lib/generated/client";

export const accountApi = {
	security: client.mySecurity,
	beginEnrollment: (method: "email" | "totp") =>
		client.beginTwoFactorEnrollment({ body: { method } }),
	completeEnrollment: (challenge: string, code: string) =>
		client.completeTwoFactorEnrollment({ body: { challenge, code } }),
	completeChallenge: (challenge: string, code: string) =>
		client.completeLoginChallenge({ body: { challenge, code } }),
	disableTwoFactor: client.disableTwoFactor,
	requestVerification: client.requestEmailVerification,
	requestPasswordReset: (email: string) =>
		client.requestPasswordReset({ body: { email } }),
	resetPassword: (token: string, password: string) =>
		client.resetPassword({ body: { token, password } }),
	confirmVerification: (token: string) =>
		client.confirmEmailVerification({ body: { token } }),
	login: (body: client.loginInput["body"]) => client.login({ body }),
	register: (body: client.registerInput["body"]) => client.register({ body }),
	me: async () => {
		const [user, settings, instance] = await Promise.all([
			client.me(),
			client.mySettings(),
			client.publicSettings(),
		]);

		return {
			...user,
			settings,
			verificationRequired:
				instance.requireEmailVerification || instance.requireTwoFactor,
			twoFactorRequired: instance.requireTwoFactor,
		};
	},
	save: async (
		body: client.updateMeInput["body"] &
			client.updateMySettingsInput["body"] &
			Partial<client.changePasswordInput["body"]>,
	) => {
		await client.updateMe({ body: { name: body.name } });

		await client.updateMySettings({
			body: {
				firstDayOfWeek: body.firstDayOfWeek,
				timezone: body.timezone,
				defaultTab: body.defaultTab,
			},
		});

		if (body.newPassword)
			await client.changePassword({
				body: {
					currentPassword: body.currentPassword || "",
					newPassword: body.newPassword,
				},
			});
	},
	remove: (password: string) => client.deleteMe({ body: { password } }),
};
