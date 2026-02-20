"use client";
import { useState } from "react";
import { X, Share2 } from "lucide-react";
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
            const url = isLogin ? "/api/users/login" : "/api/users/register";
            const body = isLogin
                ? { email, password }
                : {
                      email,
                      password,
                      name,
                      ...(inviteCode ? { inviteCode } : {}),
                  };

            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
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
                setInviteCode("");
            }
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Something went wrong",
            );
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={s.overlay} onClick={onClose}>
            <div className={s.modal} onClick={(e) => e.stopPropagation()}>
                <div className={s.modalHeader}>
                    <div className={s.brand}>
                        <Share2 size={18} /> SocialAnimal
                    </div>
                    <button className={s.closeBtn} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <h2 className={s.title}>
                    {isLogin ? "Welcome back" : "Create account"}
                </h2>
                <p className={s.subtitle}>
                    {isLogin ? "Sign in to your account" : "Join SocialAnimal"}
                </p>

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
                    {!isLogin && (
                        <div className={s.field}>
                            <label className={s.label}>
                                Invite Code{" "}
                                <span className={s.optional}>
                                    (if required)
                                </span>
                            </label>
                            <input
                                className={s.input}
                                type="text"
                                value={inviteCode}
                                onChange={(e) => setInviteCode(e.target.value)}
                                placeholder="xxxxxxxxxxxxxxxx"
                            />
                        </div>
                    )}

                    {error && <div className={s.error}>{error}</div>}
                    {success && <div className={s.successMsg}>{success}</div>}

                    <button
                        className={s.submitBtn}
                        type="submit"
                        disabled={loading}
                    >
                        {loading
                            ? "Please wait…"
                            : isLogin
                              ? "Sign In"
                              : "Create Account"}
                    </button>
                </form>

                <div className={s.switchRow}>
                    {isLogin
                        ? "Don't have an account?"
                        : "Already have an account?"}
                    <button
                        className={s.switchBtn}
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError("");
                            setSuccess("");
                        }}
                    >
                        {isLogin ? "Sign up" : "Sign in"}
                    </button>
                </div>
            </div>
        </div>
    );
}
