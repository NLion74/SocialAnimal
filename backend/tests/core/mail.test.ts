import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { sendAccountEmail, sendNotificationEmail } from "../../src/core/mail";

const { sendMail, close } = vi.hoisted(() => ({
	sendMail: vi.fn(),
	close: vi.fn(),
}));
vi.mock("nodemailer", () => ({
	default: { createTransport: () => ({ sendMail, close }) },
}));

beforeEach(() => {
	vi.stubEnv("SMTP_HOST", "mail.example.test");
	vi.stubEnv("SMTP_FROM", "app@example.test");
	vi.stubEnv("PUBLIC_URL", "https://app.example.test");
});
afterEach(() => vi.unstubAllEnvs());

it.each(["verify", "reset"] as const)(
	"sends equivalent HTML and text %s links with token fragments and expiry",
	async (kind) => {
		await sendAccountEmail(
			"person@example.test",
			kind,
			"private-token&next='value'",
		);
		const mail = sendMail.mock.calls[0][0];
		const destination = `https://app.example.test/${kind === "reset" ? "reset-password" : "verify-email"}#private-token&next='value'`;
		expect(mail.text).toContain(destination);
		expect(mail.html).toContain(
			`href="${destination.replaceAll("&", "&amp;").replaceAll("'", "&#39;")}"`,
		);
		for (const part of [mail.text, mail.html]) {
			expect(part).toContain(
				kind === "reset" ? "30 minutes" : "24 hours",
			);
			expect(part).toContain("can be used once");
		}
		expect(close).toHaveBeenCalledOnce();
	},
);

it("escapes notification text and link attributes", async () => {
	await sendNotificationEmail(
		"person@example.test",
		'<img src=x onerror="bad()"> & update',
		"/dashboard?a=1&b='two'#fragment",
	);
	const mail = sendMail.mock.calls[0][0];
	expect(mail.text).toContain(
		"https://app.example.test/dashboard?a=1&b=%27two%27#fragment",
	);
	expect(mail.html).toContain(
		'href="https://app.example.test/dashboard?a=1&amp;b=%27two%27#fragment"',
	);
	expect(mail.html).toContain(
		"&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; update",
	);
	expect(mail.html).not.toContain("<img");
});

it.each([undefined, "account-deletion"] as const)(
	"keeps %s authentication codes readable without links",
	async (action) => {
		await sendAccountEmail("person@example.test", "code", "012345", action);
		const mail = sendMail.mock.calls[0][0];
		for (const part of [mail.text, mail.html]) {
			expect(part).toContain("012345");
			expect(part).toContain("five minutes");
		}
		expect(mail.html).not.toContain("<a ");
	},
);
