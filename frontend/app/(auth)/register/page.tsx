"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { apiClient } from "../../../lib/api";
import s from "../auth.module.css";

export default function RegisterPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [inviteCode, setInviteCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

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
                ...(inviteCode ? { inviteCode } : {}),
            });
            setSuccess("Account created! Redirecting to login...");
            setTimeout(() => router.push("/login"), 1500);
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
                        <input
                            className={s.input}
                            type="password"
                            value={password}
                            required
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                    <div className={s.field}>
                        <label className={s.label}>
                            Invite Code{" "}
                            <span className={s.optional}>(if required)</span>
                        </label>
                        <input
                            className={s.input}
                            type="text"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value)}
                            placeholder="xxxxxxxxxxxxxxxx"
                        />
                    </div>

                    {error && <div className={s.error}>{error}</div>}
                    {success && <div className={s.successMsg}>{success}</div>}

                    <button
                        className={s.submitBtn}
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? "Please wait…" : "Create Account"}
                    </button>
                </form>

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
