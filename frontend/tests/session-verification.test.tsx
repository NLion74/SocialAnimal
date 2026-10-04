import { describe, it, expect, vi } from "vitest";
import {
	render,
	screen,
	fireEvent,
	waitFor,
	act,
} from "@testing-library/react";
import {
	SessionProvider,
	useSession,
} from "../features/account/SessionProvider";
import VerificationNotice from "../features/account/VerificationNotice";
import { accountApi } from "../features/account/api";
import { apiClient } from "../lib/api";

const user = {
	id: "one",
	email: "one@example.test",
	emailVerifiedAt: null,
	verificationRequired: true,
	accountRole: "normal",
	settings: {},
	isAdmin: false,
} as unknown as Awaited<ReturnType<typeof accountApi.me>>;

function Content() {
	const session = useSession();
	if (session.loading) return <p>Loading session</p>;

	return (
		<>
			<p>{session.user?.email || "Anonymous"}</p>
			<input aria-label="Unsaved profile" />
			<VerificationNotice />
		</>
	);
}

describe("verification refresh", () => {
	it("keeps the page mounted, reports unchanged status, and removes the notice after verification", async () => {
		localStorage.setItem("token", "session");
		const me = vi.spyOn(accountApi, "me").mockResolvedValue(user);

		render(
			<SessionProvider>
				<Content />
			</SessionProvider>,
		);

		await screen.findByText(user.email);

		fireEvent.change(screen.getByLabelText("Unsaved profile"), {
			target: { value: "Draft" },
		});

		fireEvent.click(screen.getByText("Check verification status"));
		await screen.findByText(/Email is still unverified/);

		expect(
			(screen.getByLabelText("Unsaved profile") as HTMLInputElement)
				.value,
		).toBe("Draft");

		me.mockResolvedValue({
			...user,
			emailVerifiedAt: new Date().toISOString(),
		});

		fireEvent.click(screen.getByText("Check verification status"));

		await waitFor(() =>
			expect(screen.queryByText("Check verification status")).toBeNull(),
		);

		expect(
			(screen.getByLabelText("Unsaved profile") as HTMLInputElement)
				.value,
		).toBe("Draft");

		me.mockRestore();
	});

	it("shows optional verification on profile when enforcement is disabled", async () => {
		localStorage.setItem("token", "session");

		const me = vi
			.spyOn(accountApi, "me")
			.mockResolvedValue({ ...user, verificationRequired: false });

		render(
			<SessionProvider>
				<Content />
			</SessionProvider>,
		);

		await screen.findByText(user.email);
		expect(screen.getByText("Resend verification email")).toBeTruthy();
		me.mockRestore();
	});

	it("ignores an old profile response after logout", async () => {
		localStorage.setItem("token", "session");
		let resolve!: (value: typeof user) => void;

		const me = vi.spyOn(accountApi, "me").mockImplementation(
			() =>
				new Promise((done) => {
					resolve = done;
				}),
		);

		render(
			<SessionProvider>
				<Content />
			</SessionProvider>,
		);

		await act(async () => {
			apiClient.setToken(null);
		});

		await screen.findByText("Anonymous");

		await act(async () => {
			resolve(user);
		});

		expect(screen.queryByText(user.email)).toBeNull();
		me.mockRestore();
	});
});
