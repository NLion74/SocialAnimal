"use client";
import { useState } from "react";
import { X, Share2 } from "lucide-react";
import { env } from "@/lib/env";
import s from "./AuthModal.module.css";

interface Props {
    onClose: () => void;
    onLogin: (token: string) => void;
}

export default function AuthModal({ onClose, onLogin }: Props) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess("");
        try {
            const res = await fetch(
                `${env.API_URL}${isLogin ? "/api/users/login" : "/api/users/register"}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(
                        isLogin
                            ? { email, password }
                            : { email, password, name },
                    ),
                },
            );
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Authentication failed");
            if (isLogin) {
                onLogin(data.token);
            } else {
                setSuccess("Account created! Please sign in.");
                setIsLogin(true);
                setEmail("");
                setPassword("");
                setName("");
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Something went wrong",
            );
        } finally {
            setLoading(false);
        }
    };

    const switchMode = () => {
        setIsLogin(!isLogin);
        setError("");
        setSuccess("");
    };

    return (
        <div className={s.overlay} onClick={onClose}>
            <div className={s.modal} onClick={(e) => e.stopPropagation()}>
                <div className={s.header}>
                    <div>
                        <div className={s.logoRow}>
                            <Share2 size={13} color="var(--purple-400)" />
                            <span className={s.logoLabel}>SocialAnimal</span>
                        </div>
                        <h2 className={s.title}>
                            {isLogin ? "Welcome back" : "Create account"}
                        </h2>
                    </div>
                    <button className={s.closeBtn} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <form className={s.form} onSubmit={submit}>
                    {!isLogin && (
                        <div className={s.field}>
                            <label className={s.label}>Name</label>
                            <input
                                className={s.input}
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Your name"
                            />
                        </div>
                    )}
                    <div className={s.field}>
                        <label className={s.label}>Email</label>
                        <input
                            className={s.input}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>
                    <div className={s.field}>
                        <label className={s.label}>Password</label>
                        <input
                            className={s.input}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <div className={s.error}>{error}</div>}
                    {success && <div className={s.successMsg}>{success}</div>}

                    <button
                        type="submit"
                        className={s.submitBtn}
                        disabled={loading}
                    >
                        {loading && <div className={s.spinner} />}
                        {loading
                            ? "Please wait…"
                            : isLogin
                              ? "Sign in"
                              : "Create account"}
                    </button>
                </form>

                <div className={s.switchRow}>
                    <span className={s.switchText}>
                        {isLogin
                            ? "Don't have an account? "
                            : "Already have an account? "}
                    </span>
                    <button className={s.switchBtn} onClick={switchMode}>
                        {isLogin ? "Sign up" : "Sign in"}
                    </button>
                </div>
            </div>
        </div>
    );
}
