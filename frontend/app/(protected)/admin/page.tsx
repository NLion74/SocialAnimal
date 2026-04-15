"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    Save,
    Ticket,
    Users,
    BarChart2,
    Settings,
    Trash2,
    ShieldCheck,
    User,
    Lock,
} from "lucide-react";
import s from "./page.module.css";
import { apiClient } from "../../../lib/api";

type AppSettings = {
    registrationsOpen: boolean;
    inviteOnly: boolean;
    maxCalendarsPerUser: number;
    minSyncInterval: number;
};

type Stats = {
    users: { total: number; byRole: Record<string, number> };
    calendars: { total: number; byType: Record<string, number> };
    events: { total: number };
};

type AdminUser = {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
    maxCalendarsOverride: number | null;
    syncIntervalOverride: number | null;
    _count: { calendars: number };
};

type Tab = "settings" | "stats" | "users";

const ROLE_ICONS: Record<string, React.ReactNode> = {
    admin: <ShieldCheck size={12} />,
    user: <User size={12} />,
    readonly: <Lock size={12} />,
};

export default function AdminPage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>("settings");

    const [settings, setSettings] = useState<AppSettings>({
        registrationsOpen: true,
        inviteOnly: false,
        maxCalendarsPerUser: 10,
        minSyncInterval: 15,
    });
    const [saving, setSaving] = useState(false);
    const [inviteCode, setInviteCode] = useState("");

    const [stats, setStats] = useState<Stats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [usersTotal, setUsersTotal] = useState(0);
    const [usersPage, setUsersPage] = useState(1);
    const [usersPages, setUsersPages] = useState(1);
    const [usersSearch, setUsersSearch] = useState("");
    const [usersLoading, setUsersLoading] = useState(false);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [editRole, setEditRole] = useState("");
    const [editMaxCal, setEditMaxCal] = useState("");
    const [editMinSync, setEditMinSync] = useState("");
    const [editSaving, setEditSaving] = useState(false);

    const [msg, setMsg] = useState("");
    const [err, setErr] = useState("");

    const flash = (m: string, isErr = false) => {
        isErr ? setErr(m) : setMsg(m);
        setTimeout(() => {
            setMsg("");
            setErr("");
        }, 4000);
    };

    useEffect(() => {
        const load = async () => {
            try {
                const data = await apiClient.get<AppSettings>(
                    "/api/admin/app-settings",
                );
                setSettings(data);
                setReady(true);
            } catch (e: any) {
                if (e?.status === 403 || e?.status === 401) {
                    router.replace("/dashboard");
                } else {
                    flash(e.message, true);
                    setReady(true);
                }
            }
        };
        load();
    }, [router]);

    useEffect(() => {
        if (activeTab === "stats") loadStats();
        if (activeTab === "users") loadUsers(1, "");
    }, [activeTab]);

    const loadStats = async () => {
        setStatsLoading(true);
        try {
            const data = await apiClient.get<Stats>("/api/admin/stats");
            setStats(data);
        } catch (e: any) {
            flash(e.message, true);
        } finally {
            setStatsLoading(false);
        }
    };

    const loadUsers = async (page: number, search: string) => {
        setUsersLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: "20",
                ...(search ? { search } : {}),
            });
            const data = await apiClient.get<any>(`/api/admin/users?${params}`);
            setUsers(data.users);
            setUsersTotal(data.total);
            setUsersPage(data.page);
            setUsersPages(data.pages);
        } catch (e: any) {
            flash(e.message, true);
        } finally {
            setUsersLoading(false);
        }
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            await apiClient.put("/api/admin/app-settings", settings);
            flash("Settings saved!");
        } catch (e: any) {
            flash(e.message, true);
        } finally {
            setSaving(false);
        }
    };

    const genInvite = async () => {
        try {
            const r = await apiClient.post<{ code: string }>(
                "/api/admin/invite",
            );
            setInviteCode(r.code);
        } catch (e: any) {
            flash(e.message, true);
        }
    };

    const openEdit = (u: AdminUser) => {
        setEditingUser(u);
        setEditRole(u.role);
        setEditMaxCal(
            u.maxCalendarsOverride != null
                ? String(u.maxCalendarsOverride)
                : "",
        );
        setEditMinSync(
            u.syncIntervalOverride != null
                ? String(u.syncIntervalOverride)
                : "",
        );
    };

    const saveUser = async () => {
        if (!editingUser) return;
        setEditSaving(true);
        try {
            await apiClient.put(`/api/admin/users/${editingUser.id}`, {
                role: editRole,
                maxCalendarsOverride:
                    editMaxCal !== "" ? parseInt(editMaxCal) : null,
                syncIntervalOverride:
                    editMinSync !== "" ? parseInt(editMinSync) : null,
            });
            flash("User updated!");
            setEditingUser(null);
            loadUsers(usersPage, usersSearch);
        } catch (e: any) {
            flash(e.message, true);
        } finally {
            setEditSaving(false);
        }
    };

    const deleteUser = async (u: AdminUser) => {
        if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return;
        try {
            await apiClient.del(`/api/admin/users/${u.id}`);
            flash(`${u.email} deleted.`);
            loadUsers(usersPage, usersSearch);
        } catch (e: any) {
            flash(e.message, true);
        }
    };

    // ── Render ───────────────────────────────────────────────────────────────
    if (!ready)
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
                <span>Loading…</span>
            </div>
        );

    return (
        <div className={s.page}>
            <div className={s.pageHeader}>
                <h1 className={s.pageTitle}>Admin</h1>
            </div>

            <div className={s.tabs}>
                {(
                    [
                        ["settings", "Settings", Settings],
                        ["stats", "Stats", BarChart2],
                        ["users", "Users", Users],
                    ] as const
                ).map(([id, label, Icon]) => (
                    <button
                        key={id}
                        className={`${s.tab} ${activeTab === id ? s.tabActive : ""}`}
                        onClick={() => setActiveTab(id)}
                    >
                        <Icon size={13} /> {label}
                    </button>
                ))}
            </div>

            {msg && <div className={s.success}>{msg}</div>}
            {err && <div className={s.error}>{err}</div>}

            {activeTab === "settings" && (
                <div className={s.section}>
                    <div className={s.sectionHeader}>
                        <span className={s.sectionTitle}>Registration</span>
                    </div>
                    <div className={s.formStack}>
                        <label className={s.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={settings.registrationsOpen}
                                onChange={(e) =>
                                    setSettings((p) => ({
                                        ...p,
                                        registrationsOpen: e.target.checked,
                                    }))
                                }
                            />
                            <span className={s.checkboxText}>
                                Allow new registrations
                            </span>
                        </label>
                        <label className={s.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={settings.inviteOnly}
                                onChange={(e) =>
                                    setSettings((p) => ({
                                        ...p,
                                        inviteOnly: e.target.checked,
                                    }))
                                }
                            />
                            <span className={s.checkboxText}>
                                Require invite code
                            </span>
                        </label>
                    </div>

                    <div
                        className={s.sectionHeader}
                        style={{ marginTop: "1.5rem" }}
                    >
                        <span className={s.sectionTitle}>Limits</span>
                    </div>
                    <div className={s.formStack}>
                        <div className={s.fieldRow}>
                            <label className={s.fieldLabel}>
                                Max calendars per user
                                <span className={s.fieldHint}>
                                    (global default)
                                </span>
                            </label>
                            <input
                                type="number"
                                min={1}
                                className={s.input}
                                value={settings.maxCalendarsPerUser}
                                onChange={(e) =>
                                    setSettings((p) => ({
                                        ...p,
                                        maxCalendarsPerUser:
                                            parseInt(e.target.value) || 1,
                                    }))
                                }
                            />
                        </div>
                        <div className={s.fieldRow}>
                            <label className={s.fieldLabel}>
                                Min sync interval (minutes)
                                <span className={s.fieldHint}>
                                    (0 = allow manual-only)
                                </span>
                            </label>
                            <input
                                type="number"
                                min={0}
                                className={s.input}
                                value={settings.minSyncInterval}
                                onChange={(e) =>
                                    setSettings((p) => ({
                                        ...p,
                                        minSyncInterval:
                                            parseInt(e.target.value) || 0,
                                    }))
                                }
                            />
                        </div>
                    </div>

                    <div className={s.formRow} style={{ marginTop: "1rem" }}>
                        <button
                            className={`${s.btn} ${s.btnPrimary}`}
                            onClick={saveSettings}
                            disabled={saving}
                        >
                            <Save size={14} />{" "}
                            {saving ? "Saving…" : "Save Settings"}
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
            )}

            {activeTab === "stats" && (
                <div className={s.section}>
                    {statsLoading || !stats ? (
                        <div className={s.loading}>
                            <div className={s.spinner} />
                        </div>
                    ) : (
                        <div className={s.statsGrid}>
                            <div className={s.statCard}>
                                <div className={s.statValue}>
                                    {stats.users.total}
                                </div>
                                <div className={s.statLabel}>Total users</div>
                                <div className={s.statBreakdown}>
                                    {Object.entries(stats.users.byRole).map(
                                        ([role, count]) => (
                                            <span
                                                key={role}
                                                className={s.statChip}
                                            >
                                                {ROLE_ICONS[role]} {role}:{" "}
                                                {count}
                                            </span>
                                        ),
                                    )}
                                </div>
                            </div>
                            <div className={s.statCard}>
                                <div className={s.statValue}>
                                    {stats.calendars.total}
                                </div>
                                <div className={s.statLabel}>
                                    Total calendars
                                </div>
                                <div className={s.statBreakdown}>
                                    {Object.entries(stats.calendars.byType).map(
                                        ([type, count]) => (
                                            <span
                                                key={type}
                                                className={s.statChip}
                                            >
                                                {type}: {count}
                                            </span>
                                        ),
                                    )}
                                </div>
                            </div>
                            <div className={s.statCard}>
                                <div className={s.statValue}>
                                    {stats.events.total}
                                </div>
                                <div className={s.statLabel}>Total events</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === "users" && (
                <div className={s.section}>
                    <div className={s.searchRow}>
                        <input
                            className={s.input}
                            placeholder="Search by name or email…"
                            value={usersSearch}
                            onChange={(e) => {
                                setUsersSearch(e.target.value);
                                loadUsers(1, e.target.value);
                            }}
                        />
                        <span className={s.totalCount}>{usersTotal} users</span>
                    </div>

                    {usersLoading ? (
                        <div className={s.loading}>
                            <div className={s.spinner} />
                        </div>
                    ) : (
                        <div className={s.userTable}>
                            {users.map((u) => (
                                <div key={u.id} className={s.userRow}>
                                    <div className={s.userInfo}>
                                        <span className={s.userName}>
                                            {u.name ?? u.email}
                                        </span>
                                        <span className={s.userEmail}>
                                            {u.email}
                                        </span>
                                    </div>
                                    <div className={s.userMeta}>
                                        <span
                                            className={`${s.roleBadge} ${s[`role_${u.role}`]}`}
                                        >
                                            {ROLE_ICONS[u.role]} {u.role}
                                        </span>
                                        <span className={s.calCount}>
                                            {u._count.calendars} cal
                                        </span>
                                        {u.maxCalendarsOverride != null && (
                                            <span className={s.overrideBadge}>
                                                max: {u.maxCalendarsOverride}
                                            </span>
                                        )}
                                        {u.syncIntervalOverride != null && (
                                            <span className={s.overrideBadge}>
                                                sync: {u.syncIntervalOverride}m
                                            </span>
                                        )}
                                    </div>
                                    <div className={s.userActions}>
                                        <button
                                            className={`${s.btn} ${s.btnSecondary}`}
                                            onClick={() => openEdit(u)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className={`${s.btn} ${s.btnDanger}`}
                                            onClick={() => deleteUser(u)}
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {usersPages > 1 && (
                        <div className={s.pagination}>
                            <button
                                className={s.btn}
                                disabled={usersPage === 1}
                                onClick={() =>
                                    loadUsers(usersPage - 1, usersSearch)
                                }
                            >
                                ←
                            </button>
                            <span>
                                {usersPage} / {usersPages}
                            </span>
                            <button
                                className={s.btn}
                                disabled={usersPage === usersPages}
                                onClick={() =>
                                    loadUsers(usersPage + 1, usersSearch)
                                }
                            >
                                →
                            </button>
                        </div>
                    )}
                </div>
            )}

            {editingUser && (
                <div
                    className={s.modalOverlay}
                    onClick={() => setEditingUser(null)}
                >
                    <div
                        className={s.modal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className={s.modalTitle}>Edit user</h2>
                        <p className={s.modalSub}>{editingUser.email}</p>

                        <div className={s.formStack}>
                            <div className={s.fieldRow}>
                                <label className={s.fieldLabel}>Role</label>
                                <select
                                    className={s.input}
                                    value={editRole}
                                    onChange={(e) =>
                                        setEditRole(e.target.value)
                                    }
                                >
                                    <option value="admin">admin</option>
                                    <option value="user">user</option>
                                    <option value="readonly">readonly</option>
                                </select>
                            </div>
                            <div className={s.fieldRow}>
                                <label className={s.fieldLabel}>
                                    Max calendars override
                                    <span className={s.fieldHint}>
                                        (leave blank = use global)
                                    </span>
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    className={s.input}
                                    placeholder="—"
                                    value={editMaxCal}
                                    onChange={(e) =>
                                        setEditMaxCal(e.target.value)
                                    }
                                />
                            </div>
                            <div className={s.fieldRow}>
                                <label className={s.fieldLabel}>
                                    Sync interval override (min)
                                    <span className={s.fieldHint}>
                                        (leave blank = use global)
                                    </span>
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    className={s.input}
                                    placeholder="—"
                                    value={editMinSync}
                                    onChange={(e) =>
                                        setEditMinSync(e.target.value)
                                    }
                                />
                            </div>
                        </div>

                        <div className={s.modalActions}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                onClick={saveUser}
                                disabled={editSaving}
                            >
                                <Save size={13} />{" "}
                                {editSaving ? "Saving…" : "Save"}
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={() => setEditingUser(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
