"use client";

import Feedback from "../../components/Feedback";

import { useState, useEffect } from "react";
import { useSession } from "./SessionProvider";
import { accountApi } from "./api";
import s from "../permissions/Permissions.module.css";

export default function VerificationNotice() {
	const { user, refresh } = useSession();
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [sending, setSending] = useState(false);
	const [checking, setChecking] = useState(false);
	const [cooldown, setCooldown] = useState(0);

	useEffect(() => {
		if (!cooldown) return;
		const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
		return () => window.clearTimeout(timer);
	}, [cooldown]);

	if (!user || user.emailVerifiedAt) return null;

	return (
		<section
			className={`${s.stack} ${s.notice}`}
			aria-label="Email verification"
		>
			<p>
				{user.verificationRequired
					? "Verify your email to access calendars and sharing."
					: "Your email address is not verified yet."}{" "}
				Check your inbox for a verification link, or request one below.
			</p>
			<div className={s.row}>
				<button
					className={s.button}
					disabled={sending || cooldown > 0}
					onClick={async () => {
						setSending(true);
						setMessage("");
						setError("");

						try {
							await accountApi.requestVerification();
							setCooldown(60);

							setMessage(
								"Verification email queued. Check your inbox and spam folder.",
							);
						} catch (e) {
							setError((e as Error).message);
						} finally {
							setSending(false);
						}
					}}
				>
					{sending
						? "Requesting…"
						: cooldown
							? `Resend in ${cooldown}s`
							: "Resend verification email"}
				</button>
				<button
					className={s.button}
					disabled={checking}
					onClick={async () => {
						setChecking(true);
						setError("");
						setMessage("");

						try {
							const next = await refresh();

							if (next && !next.emailVerifiedAt)
								setMessage(
									"Email is still unverified. Open the link in your verification email first.",
								);
						} catch (e) {
							setError((e as Error).message);
						} finally {
							setChecking(false);
						}
					}}
				>
					{checking ? "Checking…" : "Check verification status"}
				</button>
			</div>
			{message && (
				<Feedback
					tone={
						message.startsWith("Verification email queued")
							? "success"
							: "info"
					}
				>
					{message}
				</Feedback>
			)}
			{error && <Feedback focusOnMount>{error}</Feedback>}
		</section>
	);
}
