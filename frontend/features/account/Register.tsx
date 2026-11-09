"use client";

import Feedback from "../../components/Feedback";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { apiClient } from "../../lib/api";
import { accountApi } from "../account/api";
import { settingsApi } from "../settings/api";
import PasswordInput from "../../components/PasswordInput";
import s from "../../app/(auth)/auth.module.css";

export default function RegisterPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [name, setName] = useState("");
	const [inviteCode, setInviteCode] = useState("");
	const [supplied, setSupplied] = useState(false);
	const captured = useRef(false);

	useEffect(() => {
		if (captured.current) return;
		captured.current = true;

		const code = new URLSearchParams(window.location.hash.slice(1)).get(
			"invite",
		);

		if (code !== null)
			window.history.replaceState(
				null,
				"",
				window.location.pathname + window.location.search,
			);

		try {
			const value = code || sessionStorage.getItem("registration:invite");

			if (value) {
				setInviteCode(value);
				setSupplied(true);
				sessionStorage.setItem("registration:invite", value);
			}
		} catch {
			if (code) {
				setInviteCode(code);
				setSupplied(true);
			}
		}
	}, []);

	const [loading, setLoading] = useState(false);
	const [settingsLoading, setSettingsLoading] = useState(true);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState("");
	const [inviteOnly, setInviteOnly] = useState(false);

	useEffect(() => {
		const loadSettings = async () => {
			try {
				const settings = await settingsApi.public();
				setInviteOnly(!!settings?.inviteOnly);
			} catch {
				setInviteOnly(false);
			} finally {
				setSettingsLoading(false);
			}
		};

		loadSettings();
	}, []);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError("");
		setSuccess("");

		try {
			await accountApi.register({
				email,
				password,
				name,
				...(inviteCode ? { inviteCode } : {}),
			});

			try {
				sessionStorage.removeItem("registration:invite");
			} catch {}

			const login = await accountApi.login({ email, password });
			apiClient.setToken(login.token || null);
			setSuccess("Account created! Logged in successfully.");
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

				<h2 className={s.title}>Create account</h2>
				<p className={s.subtitle}>Join SocialAnimal</p>

				{settingsLoading ? (
					<div className={s.form}>
						<button className={s.submitBtn} type="button" disabled>
							Loading settings…
						</button>
					</div>
				) : (
					<form className={s.form} onSubmit={submit}>
						<div className={s.field}>
							<label className={s.label} htmlFor="register-name">
								Name
							</label>
							<input
								id="register-name"
								className={s.input}
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Your name"
								required
							/>
						</div>
						<div className={s.field}>
							<label className={s.label} htmlFor="register-email">
								Email
							</label>
							<input
								id="register-email"
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
								htmlFor="register-password"
							>
								Password
							</label>
							<PasswordInput
								id="register-password"
								className={s.input}
								value={password}
								required
								onChange={(e) => setPassword(e.target.value)}
								placeholder="••••••••"
							/>
						</div>
						{supplied && (
							<div className={s.successMsg} role="status">
								Invitation supplied.{" "}
								<button
									type="button"
									className={s.switchBtn}
									onClick={() => {
										setSupplied(false);
										setInviteCode("");

										try {
											sessionStorage.removeItem(
												"registration:invite",
											);
										} catch {}
									}}
								>
									Replace invitation
								</button>
							</div>
						)}
						{!supplied && (inviteOnly || inviteCode) && (
							<div className={s.field}>
								<label
									className={s.label}
									htmlFor="register-invite-code"
								>
									Invite Code
								</label>
								<input
									id="register-invite-code"
									className={s.input}
									type="text"
									value={inviteCode}
									onChange={(e) =>
										setInviteCode(e.target.value)
									}
									placeholder="xxxxxxxxxxxxxxxx"
								/>
							</div>
						)}

						{error && <Feedback focusOnMount>{error}</Feedback>}
						{success && (
							<div className={s.successMsg}>{success}</div>
						)}

						<button
							className={s.submitBtn}
							type="submit"
							disabled={loading || settingsLoading}
						>
							{loading ? "Please wait…" : "Create Account"}
						</button>
					</form>
				)}

				<div className={s.switchRow}>
					Already have an account?
					<a href="/login" className={s.switchBtn}>
						Sign in
					</a>
				</div>
			</div>
		</div>
	);
}
