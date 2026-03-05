"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Ticket, Save } from "lucide-react";
import s from "./page.module.css";
import { apiClient } from "../../../lib/api";

const DEFAULT_TAB_OPTIONS = [
    { value: "dashboard", label: "Dashboard" },
    { value: "calendar", label: "Calendar" },
    { value: "friends", label: "Friends" },
    { value: "profile", label: "Profile" },
] as const;

const FALLBACK_TIMEZONES = [
    "UTC",
    "Europe/Berlin",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
];

export default function ProfilePage() {
    const router = useRouter();
    const browserTimezone =
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const timezoneOptions =
        ((Intl as any).supportedValuesOf?.("timeZone") as
            | string[]
            | undefined) ?? FALLBACK_TIMEZONES;
    const [user, setUser] = useState<any>(null);
    const [name, setName] = useState("");
    const [curPw, setCurPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmNewPw, setConfirmNewPw] = useState("");
    const [deletePw, setDeletePw] = useState("");
    const [firstDay, setFirstDay] = useState<"sunday" | "monday">("monday");
    const [timezone, setTimezone] = useState(browserTimezone);
    const [defaultTab, setDefaultTab] = useState<
        "dashboard" | "calendar" | "friends" | "profile"
    >("dashboard");
    const [showAdminSettings, setShowAdminSettings] = useState(false);
    const [regOpen, setRegOpen] = useState(true);
    const [inviteOnly, setInviteOnly] = useState(false);
    const [inviteCode, setInviteCode] = useState("");
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");
    const timezoneSelectOptions = timezoneOptions.includes(timezone)
        ? timezoneOptions
        : [timezone, ...timezoneOptions];

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
                setFirstDay(
                    (u.settings?.firstDayOfWeek as "sunday" | "monday") ??
                        "monday",
                );
                setTimezone(u.settings?.timezone ?? browserTimezone);
                setDefaultTab(u.settings?.defaultTab ?? "dashboard");
                let adminAccess = !!u.isAdmin;
                if (!adminAccess) {
                    const token = localStorage.getItem("token");
                    if (token) {
                        const probe = await fetch("/api/users/app-settings", {
                            headers: { Authorization: `Bearer ${token}` },
                        });
                        adminAccess = probe.ok;
                    }
                }

                setShowAdminSettings(adminAccess);
                if (adminAccess) {
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
        if (newPw && !confirmNewPw) {
            setErr("Please confirm your new password.");
            setMsg("");
            return;
        }
        if (newPw && newPw !== confirmNewPw) {
            setErr("New passwords do not match.");
            setMsg("");
            return;
        }

        setSaving(true);
        setMsg("");
        setErr("");
        try {
            const body: any = {
                name,
                firstDayOfWeek: firstDay,
                timezone,
                defaultTab,
            };
            if (newPw) {
                body.currentPassword = curPw;
                body.newPassword = newPw;
            }
            await apiClient.put("/api/users/me", body);
            setMsg("Profile saved!");
            setCurPw("");
            setNewPw("");
            setConfirmNewPw("");
        } catch (e: any) {
            setErr(e.message);
        } finally {
            setSaving(false);
        }
    };

    const deleteAccount = async () => {
        if (!deletePw) {
            setErr("Please enter your password to delete your account.");
            setMsg("");
            return;
        }

        const confirmed = globalThis.confirm(
            "Are you sure you want to permanently delete your account? This cannot be undone.",
        );
        if (!confirmed) return;

        setDeleting(true);
        setMsg("");
        setErr("");
        try {
            await apiClient.del("/api/users/me", {
                body: { password: deletePw },
            });
            apiClient.setToken(null);
            router.push("/");
        } catch (e: any) {
            setErr(e.message);
        } finally {
            setDeleting(false);
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
                    {showAdminSettings && (
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
                    <div>
                        <label className={s.fieldLabel}>Timezone</label>
                        <select
                            className={s.input}
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                        >
                            {timezoneSelectOptions.map((tz) => (
                                <option key={tz} value={tz}>
                                    {tz}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={s.fieldLabel}>Default Tab</label>
                        <select
                            className={s.input}
                            value={defaultTab}
                            onChange={(e) =>
                                setDefaultTab(
                                    e.target.value as
                                        | "dashboard"
                                        | "calendar"
                                        | "friends"
                                        | "profile",
                                )
                            }
                        >
                            {DEFAULT_TAB_OPTIONS.map((tab) => (
                                <option key={tab.value} value={tab.value}>
                                    {tab.label}
                                </option>
                            ))}
                        </select>
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
                    <div>
                        <label className={s.fieldLabel}>
                            Confirm New Password
                        </label>
                        <input
                            className={s.input}
                            type="password"
                            value={confirmNewPw}
                            onChange={(e) => setConfirmNewPw(e.target.value)}
                            placeholder="••••••••"
                        />
                    </div>
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

            <div className={s.section}>
                <div className={s.sectionHeader}>
                    <span className={s.sectionTitle}>Delete Account</span>
                </div>
                <div className={s.formStack}>
                    <p className={s.hint}>
                        Permanently delete your account and all associated data.
                    </p>
                    <div>
                        <label className={s.fieldLabel}>Confirm Password</label>
                        <input
                            className={s.input}
                            type="password"
                            value={deletePw}
                            onChange={(e) => setDeletePw(e.target.value)}
                            placeholder="Enter your password"
                        />
                    </div>
                    <button
                        className={`${s.btn} ${s.btnDanger}`}
                        onClick={deleteAccount}
                        disabled={deleting}
                    >
                        {deleting ? "Deleting…" : "Delete Account"}
                    </button>
                </div>
            </div>

            {showAdminSettings && (
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
