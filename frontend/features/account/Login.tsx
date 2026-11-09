"use client";

import Feedback from "../../components/Feedback";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { apiClient, ApiError } from "../../lib/api";
import { accountApi } from "../account/api";
import PasswordInput from "../../components/PasswordInput";
import s from "../../app/(auth)/auth.module.css";

export default function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	const [challenge, setChallenge] = useState<{
		challenge: string;
		method: string;
	} | null>(null);

	const [recovery, setRecovery] = useState(false);
	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");

		try {
			const data = challenge
				? await accountApi.completeChallenge(challenge.challenge, code)
				: await accountApi.login({ email, password }).catch((error) => {
						// A mail outage must not prevent use of saved recovery codes.
						if (
							error instanceof ApiError &&
							error.data?.code === "MAIL_UNAVAILABLE"
						)
							return accountApi.login({
								email,
								password,
								recovery: true,
							});

						throw error;
					});

			if (data.challenge) {
				setChallenge({
					challenge: data.challenge,
					method: data.method || "email",
				});

				setPassword("");
				setRecovery(data.method === "recovery");
				return;
			}

			if (!data.token) throw new Error("Sign-in did not complete");
			apiClient.setToken(data.token);
			router.push("/dashboard");
		} catch (err: any) {
			setError(err.message || "Something went wrong");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className={s.container}>
			<div className={s.card}>
				<div className={s.brand}>
					<Share2 size={18} /> SocialAnimal
				</div>

				<h2 className={s.title}>Welcome back</h2>
				<p className={s.subtitle}>Sign in to your account</p>

				<form className={s.form} onSubmit={submit}>
					{!challenge && (
						<>
							<div className={s.field}>
								<label
									className={s.label}
									htmlFor="login-email"
								>
									Email
								</label>
								<input
									id="login-email"
									className={s.input}
									type="email"
									value={email}
									required
									onChange={(e) => setEmail(e.target.value)}
									placeholder="you@example.com"
								/>
							</div>
							<div className={s.field}>
								<label
									className={s.label}
									htmlFor="login-password"
								>
									Password
								</label>
								<PasswordInput
									id="login-password"
									className={s.input}
									value={password}
									required
									onChange={(e) =>
										setPassword(e.target.value)
									}
									placeholder="••••••••"
								/>
							</div>
						</>
					)}
					{challenge && (
						<div className={s.field}>
							<label className={s.label} htmlFor="login-code">
								{recovery
									? "Recovery code"
									: challenge.method === "email"
										? "Email code"
										: "Authenticator code"}
							</label>
							<input
								id="login-code"
								className={s.input}
								autoComplete={
									recovery ? "off" : "one-time-code"
								}
								inputMode={recovery ? "text" : "numeric"}
								value={code}
								onChange={(e) => setCode(e.target.value)}
								required
								maxLength={32}
								autoFocus
							/>
							<p className={s.subtitle}>
								{recovery
									? "Enter one of your saved recovery codes. Each code can only be used once."
									: challenge.method === "email"
										? "Check your verified email. Delivery may take a moment."
										: "Open your authenticator app."}
								{!recovery &&
									" Codes expire after five minutes."}
							</p>
							{challenge.method !== "recovery" && (
								<button
									type="button"
									className={s.switchBtn}
									disabled={loading}
									onClick={() => {
										setRecovery(!recovery);
										setCode("");
										setError("");
									}}
								>
									{recovery
										? challenge.method === "email"
											? "Use an email code instead"
											: "Use an authenticator code instead"
										: "Use a recovery code"}
								</button>
							)}
							<button
								type="button"
								className={s.switchBtn}
								onClick={() => {
									setChallenge(null);
									setRecovery(false);
									setCode("");
									setError("");
								}}
							>
								Start again / request another code
							</button>
						</div>
					)}
					{error && <Feedback focusOnMount>{error}</Feedback>}

					<button
						className={s.submitBtn}
						type="submit"
						disabled={loading}
					>
						{loading ? "Please wait…" : "Sign In"}
					</button>
				</form>

				<div className={s.switchRow}>
					<a href="/forgot-password" className={s.switchBtn}>
						Forgot password?
					</a>
				</div>

				<div className={s.switchRow}>
					Don't have an account?
					<a href="/register" className={s.switchBtn}>
						Sign up
					</a>
				</div>
			</div>
		</div>
	);
}
