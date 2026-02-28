"use client";

import { useState, useEffect } from "react";
import { Shield, Ticket, Save } from "lucide-react";
import s from "./page.module.css";
import { apiClient } from "../../../lib/api";
import type { Permission } from "../../../lib/types";

const PERM_LABELS: Record<Permission, string> = {
    busy: "🔴 Busy only - hide titles and details",
    titles: "🟡 Titles only - show event names, no descriptions",
    full: "🟢 Full details - share everything",
};

export default function ProfilePage() {
    const [user, setUser] = useState<any>(null);
    const [name, setName] = useState("");
    const [curPw, setCurPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [defPerm, setDefPerm] = useState<Permission>("full");
    const [firstDay, setFirstDay] = useState<"sunday" | "monday">("monday");
    const [regOpen, setRegOpen] = useState(true);
    const [inviteOnly, setInviteOnly] = useState(false);
    const [inviteCode, setInviteCode] = useState("");
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");

    useEffect(() => {
        let mounted = true;

        const loadProfile = async () => {
            try {
                const token = localStorage.getItem("token");
                if (!token) return;

                const u = await apiClient.get("/api/users/me");
                if (!mounted) return;

                setUser(u);
                setName(u.name ?? "");
                setDefPerm(u.settings?.defaultSharePermission ?? "full");
                setFirstDay(
                    (u.settings?.firstDayOfWeek as "sunday" | "monday") ??
                        "monday",
                );

                if (u.isAdmin) {
                    const s = await apiClient.get("/api/users/app-settings");
                    if (!mounted) return;

                    setRegOpen(s.registrationsOpen ?? true);
                    setInviteOnly(s.inviteOnly ?? false);
                }
            } catch (err: any) {
                console.error("Failed to load profile", err);

                if (!mounted) return;

                if (err?.status === 401 || err?.message?.includes("token")) {
                    setErr("You are not logged in.");
                } else if (err?.status === 403) {
                    setErr("You don't have permission for this action.");
                } else {
                    setErr("Failed to load profile.");
                }
            }
        };

        loadProfile();

        return () => {
            mounted = false;
        };
    }, []);

    const saveProfile = async () => {
        setSaving(true);
        setMsg("");
        setErr("");
        try {
            const body: any = {
                name,
                defaultSharePermission: defPerm,
                firstDayOfWeek: firstDay,
            };
            if (newPw) {
                body.currentPassword = curPw;
                body.newPassword = newPw;
            }
            await apiClient.put("/api/users/me", body);
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
            await apiClient.put("/api/users/app-settings", {
                registrationsOpen: regOpen,
                inviteOnly,
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
            const r = await apiClient.post<{ code: string }>(
                "/api/users/invite",
            );
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
                        <label className={s.fieldLabel}>
                            First Day of Week
                        </label>
                        <div className={s.firstDayGroup}>
                            <label>
                                <input
                                    type="radio"
                                    name="firstDay"
                                    value="monday"
                                    checked={firstDay === "monday"}
                                    onChange={() => setFirstDay("monday")}
                                />
                                <span>Monday</span>
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="firstDay"
                                    value="sunday"
                                    checked={firstDay === "sunday"}
                                    onChange={() => setFirstDay("sunday")}
                                />
                                <span>Sunday</span>
                            </label>
                        </div>
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
                        <label key={p} className={s.radioLabel}>
                            <input
                                type="radio"
                                name="defPerm"
                                value={p}
                                checked={defPerm === p}
                                onChange={() => setDefPerm(p)}
                            />
                            <span className={s.radioText}>
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

            {msg && <div className={s.success}>{msg}</div>}
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
                            Admin - Registration
                        </span>
                    </div>
                    <div className={s.formStack}>
                        <label className={s.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={regOpen}
                                onChange={(e) => setRegOpen(e.target.checked)}
                            />
                            <span className={s.checkboxText}>
                                Allow new registrations
                            </span>
                        </label>
                        <label className={s.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={inviteOnly}
                                onChange={(e) =>
                                    setInviteOnly(e.target.checked)
                                }
                            />
                            <span className={s.checkboxText}>
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
                            <div className={s.inviteCode}>{inviteCode}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
