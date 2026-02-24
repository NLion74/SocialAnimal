"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { apiClient } from "../../../lib/api";
import s from "../auth.module.css";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const data = await apiClient.post<{ token: string }>(
                "/api/users/login",
                { email, password },
            );
            localStorage.setItem("token", data.token);
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

                    {error && <div className={s.error}>{error}</div>}

                    <button
                        className={s.submitBtn}
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? "Please wait…" : "Sign In"}
                    </button>
                </form>

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
