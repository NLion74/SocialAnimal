"use client";

import { useEffect, useState, useRef } from "react";
import { Share2 } from "lucide-react";
import { accountApi } from "./api";
import { apiClient } from "../../lib/api";
import PasswordInput from "../../components/PasswordInput";
import Feedback from "../../components/Feedback";
import s from "../../app/(auth)/auth.module.css";

export default function PasswordRecovery({
	reset = false,
}: {
	reset?: boolean;
}) {
	const captured = useRef(false);
	const [token, setToken] = useState("");
	const [ready, setReady] = useState(false);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [done, setDone] = useState(false);

	useEffect(() => {
		if (!reset) {
			setReady(true);
			return;
		}

		const capture = () => {
			const value = window.location.hash.slice(1);
			window.history.replaceState(null, "", window.location.pathname);
			setToken(value);
			setDone(false);
			setPassword("");
			setConfirmation("");
			setReady(true);

			setError(
				/^[A-Za-z0-9_-]{43}$/.test(value)
					? ""
					: "This reset link is missing or invalid. Request a new link.",
			);
		};

		if (!captured.current) {
			captured.current = true;
			capture();
		}

		window.addEventListener("hashchange", capture);
		return () => window.removeEventListener("hashchange", capture);
	}, [reset]);

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setError("");

		if (reset && password !== confirmation) {
			setError("Passwords do not match.");
			return;
		}

		setPending(true);

		try {
			if (reset) {
				await accountApi.resetPassword(token, password);
				apiClient.setToken(null);
				setToken("");
				setPassword("");
				setConfirmation("");
			} else await accountApi.requestPasswordReset(email);

			setDone(true);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className={s.container}>
			<div className={s.card}>
				<div className={s.brand}>
					<Share2 size={18} /> SocialAnimal
				</div>
				<h1 className={s.title}>
					{reset ? "Choose a new password" : "Forgot your password?"}
				</h1>
				<p className={s.subtitle}>
					{reset
						? "Changing your password signs out all existing sessions."
						: "Enter your account email to request a reset link."}
				</p>
				{done ? (
					<Feedback
						tone="success"
						title={reset ? "Password changed" : "Request received"}
					>
						{reset
							? "Sign in with your new password."
							: "If this address belongs to an eligible account, a reset link will arrive shortly. Check your spam folder too."}
					</Feedback>
				) : (
					<form className={s.form} onSubmit={submit}>
						{reset ? (
							<>
								<label className={s.field}>
									New password
									<PasswordInput
										className={s.input}
										autoComplete="new-password"
										disabled={!ready || pending}
										minLength={8}
										maxLength={128}
										required
										value={password}
										onChange={(e) =>
											setPassword(e.target.value)
										}
									/>
								</label>
								<label className={s.field}>
									Confirm new password
									<PasswordInput
										className={s.input}
										autoComplete="new-password"
										disabled={!ready || pending}
										minLength={8}
										maxLength={128}
										required
										value={confirmation}
										onChange={(e) =>
											setConfirmation(e.target.value)
										}
									/>
								</label>
							</>
						) : (
							<label className={s.field}>
								Email
								<input
									className={s.input}
									type="email"
									autoComplete="email"
									disabled={!ready || pending}
									maxLength={254}
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								/>
							</label>
						)}
						{error && (
							<Feedback
								focusOnMount
								title={
									reset
										? "Password was not changed"
										: "Request could not be sent"
								}
							>
								{error}
							</Feedback>
						)}
						<button
							className={s.submitBtn}
							disabled={pending || !ready || (reset && !token)}
						>
							{pending
								? "Please wait…"
								: reset
									? "Change password"
									: "Send reset link"}
						</button>
					</form>
				)}
				<div className={s.switchRow}>
					<a className={s.switchBtn} href="/login">
						Back to sign in
					</a>
					{reset && !done && (
						<a className={s.switchBtn} href="/forgot-password">
							Request a new link
						</a>
					)}
				</div>
			</div>
		</div>
	);
}
