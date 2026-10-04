"use client";

import { useState } from "react";
import { useSession } from "./SessionProvider";
import { accountApi } from "./api";
import { apiClient } from "../../lib/api";
import Feedback from "../../components/Feedback";
import CopyField from "../../components/CopyField";
import s from "../permissions/Permissions.module.css";

type Enrollment = Awaited<ReturnType<typeof accountApi.beginEnrollment>>;

export default function TwoFactorSettings() {
	const { user, refresh, logout } = useSession();
	const [method, setMethod] = useState<"email" | "totp">("totp");
	const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
	const [code, setCode] = useState("");
	const [codes, setCodes] = useState<string[]>([]);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);

	async function action(fn: () => Promise<void>) {
		setBusy(true);
		setError("");
		setNotice("");

		try {
			await fn();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className={s.stack} aria-label="Two-factor authentication">
			<h2>Two-factor authentication</h2>
			<p>
				Current method:{" "}
				<strong>
					{user?.twoFactorMethod === "totp"
						? "Authenticator app"
						: user?.twoFactorMethod === "email"
							? "Email code"
							: "None"}
				</strong>
				. Only one method can be active.
			</p>
			<p className={s.hint}>
				Sign in again before changing these settings if your sign-in was
				more than five minutes ago.
			</p>
			{user?.twoFactorRequired && (
				<p className={s.hint}>
					Your administrator requires two-factor authentication.
				</p>
			)}
			{error && <Feedback focusOnMount>{error}</Feedback>}
			{notice && <Feedback tone="success">{notice}</Feedback>}
			{!enrollment ? (
				<div className={s.row}>
					<label className={s.field}>
						New method
						<select
							className={s.select}
							value={method}
							onChange={(e) =>
								setMethod(e.target.value as typeof method)
							}
						>
							<option value="totp">Authenticator app</option>
							<option
								value="email"
								disabled={!user?.emailVerifiedAt}
							>
								Email code
								{!user?.emailVerifiedAt
									? " (verify email first)"
									: ""}
							</option>
						</select>
					</label>
					<button
						className={s.button}
						disabled={busy || user?.accountRole === "readonly"}
						onClick={() =>
							void action(async () => {
								setCodes([]);

								setEnrollment(
									await accountApi.beginEnrollment(method),
								);
							})
						}
					>
						Set up method
					</button>
					{user?.twoFactorMethod !== "none" &&
						!user?.twoFactorRequired && (
							<button
								className={s.button}
								disabled={busy}
								onClick={() =>
									void action(async () => {
										await accountApi.disableTwoFactor();
										logout();
									})
								}
							>
								Use no second factor
							</button>
						)}
				</div>
			) : (
				<form
					className={s.stack}
					onSubmit={(e) => {
						e.preventDefault();

						void action(async () => {
							const result = await accountApi.completeEnrollment(
								enrollment.challenge,
								code,
							);

							if (!result.token)
								throw new Error("Enrollment did not complete");

							apiClient.setToken(result.token);
							setCodes(result.recoveryCodes || []);
							setEnrollment(null);
							setCode("");

							setNotice(
								"Two-factor authentication updated. Save your recovery codes below.",
							);

							await refresh();
						});
					}}
				>
					{enrollment.secret ? (
						<>
							<p>
								Add this setup key to your authenticator app,
								then enter its six-digit code. Your previous
								method stays active until confirmed.
							</p>
							<CopyField
								label="Authenticator setup key"
								value={enrollment.secret}
								actionLabel="Copy setup key"
								copiedLabel="Setup key copied"
								copiedMessage="Paste this key into your authenticator app. Keep it private."
							/>
						</>
					) : (
						<p>
							A code has been queued for your verified email
							address.
						</p>
					)}
					<label className={s.field}>
						Confirmation code
						<input
							className={s.input}
							autoComplete="one-time-code"
							inputMode="numeric"
							pattern="[0-9]{6}"
							maxLength={6}
							value={code}
							onChange={(e) => setCode(e.target.value)}
							required
						/>
					</label>
					<div className={s.row}>
						<button
							className={`${s.button} ${s.primary}`}
							disabled={busy}
						>
							Confirm method
						</button>
						<button
							type="button"
							className={s.button}
							onClick={() => {
								setEnrollment(null);
								setCode("");
							}}
						>
							Cancel
						</button>
					</div>
				</form>
			)}
			{!!codes.length && (
				<div className={s.notice}>
					<p>
						Each recovery code works once. Store them privately;
						they will not be displayed again.
					</p>
					<CopyField
						multiline
						label="Recovery codes"
						value={codes.join("\n")}
						actionLabel="Copy recovery codes"
						copiedLabel="Recovery codes copied"
						copiedMessage="Store these codes privately. Do not send them to anyone."
					/>
					<button className={s.button} onClick={() => setCodes([])}>
						I saved my codes
					</button>
				</div>
			)}
		</section>
	);
}
