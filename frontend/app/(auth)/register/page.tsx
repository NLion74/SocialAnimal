"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { apiClient } from "../../../lib/api";
import PasswordInput from "../../../components/PasswordInput";
import s from "../auth.module.css";

export default function RegisterPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [inviteOnly, setInviteOnly] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings = await apiClient.get<{
                    inviteOnly: boolean;
                }>("/api/users/public-settings");
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
            await apiClient.post("/api/users/register", {
                email,
                password,
                name,
                ...(inviteOnly && inviteCode ? { inviteCode } : {}),
            });
            const login = await apiClient.post<{ token: string }>(
                "/api/users/login",
                { email, password },
            );
            apiClient.setToken(login.token);
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
                            <label className={s.label}>Name</label>
                            <input
                                className={s.input}
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                                required
                            />
                        </div>
                        <div className={s.field}>
                            <label className={s.label}>Email</label>
                            <input
                                className={s.input}
                                type="email"
                                value={email}
                                required
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                            />
                        </div>
                        <div className={s.field}>
                            <label className={s.label}>Password</label>
                            <PasswordInput
                                className={s.input}
                                value={password}
                                required
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                        {inviteOnly && (
                            <div className={s.field}>
                                <label className={s.label}>Invite Code</label>
                                <input
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

                        {error && <div className={s.error}>{error}</div>}
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
