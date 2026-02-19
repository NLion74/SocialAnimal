"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Plus,
    RefreshCw,
    Trash2,
    X,
    Copy,
    Check,
    Link,
    Calendar,
    Edit,
} from "lucide-react";
import { env } from "../lib/env";
import s from "./GeneralTab.module.css";

interface CalendarData {
    id: string;
    name: string;
    type: string;
    url?: string;
    config?: Record<string, any>;
    syncInterval: number;
    lastSync?: string | null;
    createdAt: string;
    updatedAt: string;
    events?: {
        id: string;
        title: string;
        startTime: string;
        endTime: string;
        allDay: boolean;
    }[];
}

interface Friend {
    id: string;
    user1: { id: string; email: string; name?: string };
    user2: { id: string; email: string; name?: string };
    status: string;
    sharedCalendarIds: string[];
    sharedWithMe: { id: string; name: string }[];
}

function getUid(): string | null {
    const t =
        typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!t) return null;
    try {
        return JSON.parse(atob(t)).sub;
    } catch {
        return null;
    }
}

export default function GeneralTab() {
    const [calendars, setCalendars] = useState<CalendarData[]>([]);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editingCalendar, setEditingCalendar] = useState<CalendarData | null>(
        null,
    );

    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [sync, setSync] = useState(60);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [showExport, setShowExport] = useState(false);
    const [exportLink, setExportLink] = useState("");
    const [exportLabel, setExportLabel] = useState("");
    const [copied, setCopied] = useState(false);

    const api = useCallback(
        (path: string, opts?: RequestInit) =>
            fetch(path, {
                ...opts,
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                    ...(opts?.body
                        ? { "Content-Type": "application/json" }
                        : {}),
                    ...(opts?.headers ?? {}),
                },
            }),
        [],
    );

    useEffect(() => {
        load();
    }, []);

    useEffect(() => {
        if (editingCalendar) {
            setName(editingCalendar.name);
            setUrl(editingCalendar.config?.url || "");
            setUsername(editingCalendar.config?.username || "");
            setPassword(editingCalendar.config?.password || "");
            setSync(editingCalendar.syncInterval ?? 60);
        } else resetForm();
    }, [editingCalendar]);

    const resetForm = () => {
        setName("");
        setUrl("");
        setUsername("");
        setPassword("");
        setSync(60);
        setError("");
    };

    const load = async () => {
        setLoading(true);
        const [cr, fr] = await Promise.all([
            api("/api/calendars"),
            api("/api/friends"),
        ]);
        if (cr.ok) setCalendars(await cr.json());
        if (fr.ok) setFriends(await fr.json());
        setLoading(false);
    };

    const openCreate = () => {
        setEditingCalendar(null);
        resetForm();
        setShowModal(true);
    };

    const openEdit = (c: CalendarData) => {
        setEditingCalendar(c);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingCalendar(null);
        resetForm();
    };

    const saveCalendar = async () => {
        if (!name || !url) return;
        setSaving(true);
        setError("");

        try {
            const body = {
                name,
                type: "ics",
                syncInterval: sync,
                config: {
                    url,
                    ...(username && { username }),
                    ...(password && { password }),
                },
            };
            const r = await api(
                editingCalendar
                    ? `/api/calendars/${editingCalendar.id}`
                    : "/api/calendars",
                {
                    method: editingCalendar ? "PUT" : "POST",
                    body: JSON.stringify(body),
                },
            );
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || "Failed");
            closeModal();
            await load();
        } catch (e: any) {
            setError(e.message || "Failed");
        } finally {
            setSaving(false);
        }
    };

    const doSync = async (id: string) => {
        setSyncingId(id);
        await api(`/api/calendars/${id}/sync`, { method: "POST" });
        await load();
        setSyncingId(null);
    };

    const doDelete = async (id: string) => {
        if (!confirm("Delete this calendar and all its events?")) return;
        await api(`/api/calendars/${id}`, { method: "DELETE" });
        await load();
    };

    const openExportLink = (
        type: "all" | "calendar" | "friend",
        id?: string,
        label?: string,
    ) => {
        const token = localStorage.getItem("token");
        if (!token) return;
        const base = env.ICS_BASE_URL;
        const t = encodeURIComponent(token);
        const link =
            type === "all"
                ? `${base}/api/ics/my-calendar.ics?token=${t}`
                : type === "calendar"
                  ? `${base}/api/ics/calendar/${id}.ics?token=${t}`
                  : `${base}/api/ics/friend/${id}.ics?token=${t}`;
        setExportLink(link);
        setExportLabel(label ?? "Full calendar");
        setShowExport(true);
        setCopied(false);
    };

    const doCopy = () => {
        navigator.clipboard.writeText(exportLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const uid = getUid();
    const accepted = friends.filter((f) => f.status === "accepted");
    const total = calendars.reduce((n, c) => n + (c.events?.length || 0), 0);

    if (loading)
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
                <span>Loading…</span>
            </div>
        );

    return (
        <div className={s.page}>
            <div className={s.pageHeader}>
                <h1 className={s.pageTitle}>Dashboard</h1>
                <div className={s.btnRow}>
                    <button
                        className={`${s.btn} ${s.btnSecondary}`}
                        onClick={() => openExportLink("all")}
                    >
                        <Link size={14} /> Export All
                    </button>
                    <button
                        className={`${s.btn} ${s.btnPrimary}`}
                        onClick={openCreate}
                    >
                        <Plus size={14} /> Import Calendar
                    </button>
                </div>
            </div>

            <div className={s.statsGrid}>
                {[
                    { label: "Calendars", value: calendars.length },
                    { label: "Total Events", value: total },
                    { label: "Friends", value: accepted.length },
                ].map(({ label, value }) => (
                    <div key={label} className={s.statCard}>
                        <div className={s.statValue}>{value}</div>
                        <div className={s.statLabel}>{label}</div>
                    </div>
                ))}
            </div>

            <div className={s.section}>
                <div className={s.sectionHeader}>
                    <span className={s.sectionTitle}>My Calendars</span>
                    <button
                        className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`}
                        onClick={openCreate}
                    >
                        <Plus size={12} /> Add
                    </button>
                </div>
                {calendars.length === 0 ? (
                    <div className={s.empty}>
                        <Calendar size={38} className={s.emptyIcon} />
                        <span>No calendars yet</span>
                    </div>
                ) : (
                    <div className={s.list}>
                        {calendars.map((c) => (
                            <div key={c.id} className={s.row}>
                                <div className={s.rowInfo}>
                                    <div className={s.rowName}>{c.name}</div>
                                    <div className={s.rowMeta}>
                                        <span
                                            className={`${s.badge} ${s.badgePurple}`}
                                        >
                                            {c.type}
                                        </span>
                                        <span className={s.metaText}>
                                            {c.events?.length || 0} events
                                        </span>
                                        {c.lastSync && (
                                            <span className={s.metaText}>
                                                synced{" "}
                                                {new Date(
                                                    c.lastSync,
                                                ).toLocaleString()}
                                            </span>
                                        )}
                                    </div>
                                    {c.url && (
                                        <div className={s.rowUrl}>{c.url}</div>
                                    )}
                                </div>
                                <div className={s.rowActions}>
                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() =>
                                            openExportLink(
                                                "calendar",
                                                c.id,
                                                c.name,
                                            )
                                        }
                                    >
                                        <Link size={12} />
                                    </button>
                                    {c.type === "ics_url" && (
                                        <button
                                            className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                            onClick={() => doSync(c.id)}
                                            disabled={syncingId === c.id}
                                        >
                                            <RefreshCw size={12} />
                                        </button>
                                    )}
                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() => openEdit(c)}
                                    >
                                        <Edit size={12} />
                                    </button>
                                    <button
                                        className={`${s.btn} ${s.btnDanger} ${s.btnSm} ${s.btnIcon}`}
                                        onClick={() => doDelete(c.id)}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showModal && (
                <div className={s.overlay} onClick={closeModal}>
                    <div
                        className={s.modal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={s.modalHeader}>
                            <span className={s.modalTitle}>
                                {editingCalendar
                                    ? "Edit Calendar"
                                    : "Import Calendar"}
                            </span>
                            <button className={s.closeBtn} onClick={closeModal}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className={s.formStack}>
                            <div>
                                <label className={s.fieldLabel}>Name</label>
                                <input
                                    className={s.input}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className={s.fieldLabel}>ICS URL</label>
                                <input
                                    className={s.input}
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className={s.fieldLabel}>
                                    Username (optional)
                                </label>
                                <input
                                    className={s.input}
                                    value={username}
                                    onChange={(e) =>
                                        setUsername(e.target.value)
                                    }
                                />
                            </div>
                            <div>
                                <label className={s.fieldLabel}>
                                    Password (optional)
                                </label>
                                <input
                                    className={s.input}
                                    type="password"
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                />
                            </div>
                            <div>
                                <label className={s.fieldLabel}>
                                    Auto-sync (minutes)
                                </label>
                                <input
                                    className={s.input}
                                    type="number"
                                    min={0}
                                    value={sync}
                                    onChange={(e) =>
                                        setSync(Number(e.target.value))
                                    }
                                />
                            </div>
                            {error && <div className={s.error}>{error}</div>}
                            <div className={s.formRow}>
                                <button
                                    className={`${s.btn} ${s.btnPrimary}`}
                                    style={{ flex: 1 }}
                                    onClick={saveCalendar}
                                    disabled={saving}
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                                <button
                                    className={`${s.btn} ${s.btnSecondary}`}
                                    onClick={closeModal}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showExport && (
                <div className={s.overlay} onClick={() => setShowExport(false)}>
                    <div
                        className={s.modal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={s.modalHeader}>
                            <span className={s.modalTitle}>
                                ICS Subscription Link
                            </span>
                            <button
                                className={s.closeBtn}
                                onClick={() => setShowExport(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className={s.linkRow}>
                            <input
                                readOnly
                                className={s.linkInput}
                                value={exportLink}
                            />
                            <button
                                className={`${s.btn} ${s.btnPrimary} ${s.btnIcon}`}
                                onClick={doCopy}
                            >
                                {copied ? (
                                    <Check size={15} />
                                ) : (
                                    <Copy size={15} />
                                )}
                            </button>
                        </div>
                        {copied && (
                            <div className={s.copiedMsg}>
                                ✓ Copied to clipboard
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
