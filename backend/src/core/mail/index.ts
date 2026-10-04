import nodemailer from "nodemailer";

export function mailConfigured(): boolean {
	return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

export const sendVerificationEmail = (email: string, token: string) =>
	sendAccountEmail(email, "verify", token);

export async function sendAccountEmail(
	email: string,
	kind: "verify" | "reset" | "changed" | "code" | "security",
	token?: string,
) {
	if (!mailConfigured()) throw new Error("SMTP is not configured");
	const secure = process.env.SMTP_SECURE === "true";

	const transport = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: Number(process.env.SMTP_PORT) || (secure ? 465 : 587),
		secure,
		requireTLS: !secure && process.env.SMTP_REQUIRE_TLS !== "false",
		auth: process.env.SMTP_USER
			? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
			: undefined,
		connectionTimeout: 10000,
		greetingTimeout: 10000,
		socketTimeout: 15000,
		logger: false,
		debug: false,
	});

	const url = new URL(
		kind === "reset" ? "/reset-password" : "/verify-email",
		process.env.PUBLIC_URL || "http://localhost:3000",
	);

	url.hash = token || "";

	const subject =
		kind === "code"
			? "Your SocialAnimal sign-in code"
			: kind === "security"
				? "Your SocialAnimal security settings changed"
				: kind === "verify"
					? "Verify your SocialAnimal email address"
					: kind === "reset"
						? "Reset your SocialAnimal password"
						: "Your SocialAnimal password changed";

	const text =
		kind === "code"
			? `Your SocialAnimal code is ${token}. It expires in five minutes. Never share this code.`
			: kind === "security"
				? "Your SocialAnimal two-factor settings were changed. If this was not you, contact your administrator immediately."
				: kind === "changed"
					? "Your SocialAnimal password was changed and existing sessions were signed out. If this was not you, request a password reset or contact your administrator."
					: `${kind === "reset" ? "Reset your password" : "Confirm your email address"} for SocialAnimal:\n\n${url.href}\n\nThis link expires in ${kind === "reset" ? "30 minutes" : "24 hours"} and can be used once. If you did not request this, ignore this email.`;

	try {
		await transport.sendMail({
			from: process.env.SMTP_FROM,
			to: { address: email, name: "" },
			subject,
			text,
			disableFileAccess: true,
			disableUrlAccess: true,
		});
	} finally {
		transport.close();
	}
}
