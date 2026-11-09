"use client";

import Feedback from "../../components/Feedback";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { accountApi } from "./api";
import { useSession } from "./SessionProvider";
import s from "../../app/(auth)/auth.module.css";

export default function VerifyEmail() {
	const captured = useRef(false);
	const [token, setToken] = useState("");
	const [error, setError] = useState("");
	const [verified, setVerified] = useState(false);
	const [busy, setBusy] = useState(false);
	const { refresh } = useSession();

	useEffect(() => {
		if (captured.current) return;
		captured.current = true;
		const value = window.location.hash.slice(1);
		setToken(value);
		window.history.replaceState(null, "", window.location.pathname);

		if (!value)
			setError(
				"Open the verification link from your email. You can request a new link after signing in.",
			);
	}, []);

	return (
		<div className={s.container}>
			<section className={s.card}>
				<h1 className={s.title}>
					{verified ? "Email verified" : "Verify your email"}
				</h1>
				<p className={s.subtitle}>
					{verified
						? "Your email address is confirmed. You can now return to your account."
						: "Confirm your email address to finish setting up your account."}
				</p>
				{error && <Feedback focusOnMount>{error}</Feedback>}
				{!verified && token && (
					<button
						className={s.submitBtn}
						disabled={busy}
						onClick={async () => {
							setBusy(true);
							setError("");

							try {
								await accountApi.confirmVerification(token);
								setVerified(true);
								setToken("");
								await refresh();
							} catch (e) {
								setError((e as Error).message);
							} finally {
								setBusy(false);
							}
						}}
					>
						{busy ? "Verifying…" : "Verify email address"}
					</button>
				)}
				<div className={s.switchRow}>
					<Link
						className={s.switchBtn}
						href={verified ? "/dashboard" : "/login"}
					>
						{verified
							? "Continue to SocialAnimal"
							: "Sign in to request a new link"}
					</Link>
				</div>
			</section>
		</div>
	);
}
