"use client";
import { useState, useEffect } from "react";
import { Shield, Ticket, Save } from "lucide-react";
import s from "./ProfileTab.module.css";
import { apiFetch } from "@/lib/api";

type Permission = "busy" | "titles" | "full";
const PERM_LABELS: Record<Permission, string> = {
    busy: "🔴 Busy only — hide titles and details",
    titles: "🟡 Titles only — show event names, no descriptions",
    full: "🟢 Full details — share everything",
};

export default function ProfileTab() {
    const [user, setUser] = useState<any>(null);
    const [name, setName] = useState("");
    const [curPw, setCurPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [defPerm, setDefPerm] = useState<Permission>("full");
    const [regOpen, setRegOpen] = useState(true);
    const [inviteOnly, setInviteOnly] = useState(false);
    const [inviteCode, setInviteCode] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");

    useEffect(() => {
        apiFetch("/api/users/me").then((u: any) => {
            setUser(u);
            setName(u.name ?? "");
            setDefPerm(u.settings?.defaultSharePermission ?? "full");
        });
        apiFetch("/api/users/app-settings")
            .then((s: any) => {
                setRegOpen(s.registrationsOpen ?? true);
                setInviteOnly(s.inviteOnly ?? false);
            })
            .catch(() => {});
    }, []);

    const saveProfile = async () => {
        setSaving(true);
        setMsg("");
        setErr("");
        try {
            const body: any = { name, defaultSharePermission: defPerm };
            if (newPw) {
                body.currentPassword = curPw;
                body.newPassword = newPw;
            }
            await apiFetch("/api/users/me", {
                method: "PUT",
                body: JSON.stringify(body),
            });
            setMsg("Profile saved!");
            setCurPw("");
            setNewPw("");
        } catch (e: any) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    const saveAdmin = async () => {
        setSaving(true);
        setMsg("");
        setErr("");
        try {
            await apiFetch("/api/users/app-settings", {
                method: "PUT",
                body: JSON.stringify({
                    registrationsOpen: regOpen,
                    inviteOnly,
                }),
            });
            setMsg("Admin settings saved!");
        } catch (e: any) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    const genInvite = async () => {
        try {
            const r = await apiFetch<{ code: string }>("/api/users/invite", {
                method: "POST",
            });
            setInviteCode(r.code);
        } catch (e: any) {
            setErr(e.message);
        }
    };

    if (!user)
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
                <span>Loading…</span>
            </div>
        );

    return (
        <div className={s.page}>
            <div className={s.pageHeader}>
                <h1 className={s.pageTitle}>
                    Profile & Settings
                    {user.isAdmin && (
                        <span
                            className={s.badgePurple}
                            style={{
                                marginLeft: "0.75rem",
                                verticalAlign: "middle",
                            }}
                        >
                            <Shield size={11} style={{ marginRight: 3 }} />
                            Admin
                        </span>
                    )}
                </h1>
            </div>

            <div className={s.section}>
                <div className={s.sectionHeader}>
                    <span className={s.sectionTitle}>Profile</span>
                </div>
                <div className={s.formStack}>
                    <div>
                        <label className={s.fieldLabel}>Email</label>
                        <input
                            className={s.input}
                            value={user.email}
                            readOnly
                            style={{ opacity: 0.6 }}
                        />
                    </div>
                    <div>
                        <label className={s.fieldLabel}>Display Name</label>
                        <input
                            className={s.input}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Your name"
                        />
                    </div>
                </div>
            </div>

            <div className={s.section}>
                <div className={s.sectionHeader}>
                    <span className={s.sectionTitle}>Change Password</span>
                </div>
                <div className={s.formStack}>
                    <div>
                        <label className={s.fieldLabel}>Current Password</label>
                        <input
                            className={s.input}
                            type="password"
                            value={curPw}
                            onChange={(e) => setCurPw(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                    <div>
                        <label className={s.fieldLabel}>New Password</label>
                        <input
                            className={s.input}
                            type="password"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
                </div>
            </div>

            <div className={s.section}>
                <div className={s.sectionHeader}>
                    <span className={s.sectionTitle}>
                        Default Sharing Permission
                    </span>
                </div>
                <div className={s.formStack}>
                    {(Object.keys(PERM_LABELS) as Permission[]).map((p) => (
                        <label
                            key={p}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.625rem",
                                cursor: "pointer",
                            }}
                        >
                            <input
                                type="radio"
                                name="defPerm"
                                value={p}
                                checked={defPerm === p}
                                onChange={() => setDefPerm(p)}
                            />
                            <span
                                style={{
                                    fontSize: "0.875rem",
                                    color: "var(--text-primary)",
                                }}
                            >
                                {PERM_LABELS[p]}
                            </span>
                        </label>
                    ))}
                    <p className={s.hint}>
                        Default permission when sharing a calendar with a
                        friend. Override per-share in the Friends tab.
                    </p>
                </div>
            </div>

            {msg && (
                <div style={{ color: "var(--success)", fontSize: "0.875rem" }}>
                    {msg}
                </div>
            )}
            {err && <div className={s.error}>{err}</div>}

            <button
                className={`${s.btn} ${s.btnPrimary}`}
                onClick={saveProfile}
                disabled={saving}
            >
                <Save size={14} /> {saving ? "Saving…" : "Save Profile"}
            </button>

            {user.isAdmin && (
                <div className={s.section}>
                    <div className={s.sectionHeader}>
                        <span className={s.sectionTitle}>
                            <Shield size={13} style={{ marginRight: 4 }} />
                            Admin — Registration
                        </span>
                    </div>
                    <div className={s.formStack}>
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.625rem",
                                cursor: "pointer",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={regOpen}
                                onChange={(e) => setRegOpen(e.target.checked)}
                            />
                            <span
                                style={{
                                    fontSize: "0.875rem",
                                    color: "var(--text-primary)",
                                }}
                            >
                                Allow new registrations
                            </span>
                        </label>
                        <label
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.625rem",
                                cursor: "pointer",
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={inviteOnly}
                                onChange={(e) =>
                                    setInviteOnly(e.target.checked)
                                }
                            />
                            <span
                                style={{
                                    fontSize: "0.875rem",
                                    color: "var(--text-primary)",
                                }}
                            >
                                Require invite code to register
                            </span>
                        </label>
                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={saveAdmin}
                                disabled={saving}
                            >
                                Save Admin Settings
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={genInvite}
                            >
                                <Ticket size={14} /> Generate Invite Code
                            </button>
                        </div>
                        {inviteCode && (
                            <div
                                style={{
                                    fontFamily: "monospace",
                                    fontSize: "0.9rem",
                                    color: "var(--purple-300)",
                                    background: "var(--bg-elevated)",
                                    padding: "0.5rem 0.75rem",
                                    borderRadius: "var(--radius-md)",
                                    border: "1px solid var(--border)",
                                }}
                            >
                                {inviteCode}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
