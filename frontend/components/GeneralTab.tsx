"use client";

import { useState, useEffect } from "react";
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
import { apiClient } from "../lib/api";
import type { CalendarData, Friend } from "../lib/types";
import s from "./GeneralTab.module.css";

export default function GeneralTab() {
    const [calendars, setCalendars] = useState<CalendarData[]>([]);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);

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
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const run = async () => {
            await loadAll();
        };

        run();
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

    const loadAll = async () => {
        setLoading(true);

        try {
            const [crRaw, frRaw] = await Promise.all([
                apiClient
                    .request<CalendarData[]>("/api/calendars")
                    .catch(() => []),
                apiClient.request<Friend[]>("/api/friends").catch(() => []),
            ]);

            setCalendars((prev) =>
                crRaw.map((c) => {
                    const old = prev.find((p) => p.id === c.id);

                    return {
                        ...c,

                        lastSyncSuccess:
                            c.lastSyncSuccess ?? old?.lastSyncSuccess ?? true,

                        lastTestSuccess:
                            c.lastTestSuccess ?? old?.lastTestSuccess ?? true,

                        lastError: c.lastError ?? old?.lastError ?? null,
                    };
                }),
            );

            setFriends(frRaw);
        } finally {
            setLoading(false);
        }
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

    const copyCalendar = (c: CalendarData) => {
        setEditingCalendar(null);

        setName(`${c.name} (copy)`);
        setUrl(c.config?.url || "");
        setUsername(c.config?.username || "");
        setPassword(c.config?.password || "");
        setSync(c.syncInterval ?? 60);

        setError("");
        setShowModal(true);
    };

    const doDelete = async (id: string) => {
        if (!confirm("Delete this calendar? This cannot be undone.")) return;

        try {
            await apiClient.request(`/api/calendars/${id}`, {
                method: "DELETE",
            });

            setCalendars((prev) => prev.filter((c) => c.id !== id));
        } catch (err: any) {
            alert(err.message || "Failed to delete calendar");
        }
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

        const config = {
            url,
            ...(username && { username }),
            ...(password && { password }),
        };

        try {
            const testRes = await apiClient.post(
                "/api/calendars/test-connection",
                {
                    type: "ics",
                    config,
                },
            );

            if (!testRes?.success) {
                setError(testRes?.error || "Connection test failed");
                return;
            }

            const body = {
                name,
                type: "ics",
                syncInterval: sync,
                config,
            };

            await apiClient.request(
                editingCalendar
                    ? `/api/calendars/${editingCalendar.id}`
                    : "/api/calendars",
                {
                    method: editingCalendar ? "PUT" : "POST",
                    body,
                },
            );

            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Test or save failed");
        } finally {
            setSaving(false);
        }
    };

    const doSync = async (c: CalendarData) => {
        setSyncingId(c.id);

        try {
            const res = await apiClient.post(`/api/calendars/${c.id}/sync`);

            setCalendars((prev) =>
                prev.map((cal) =>
                    cal.id === c.id
                        ? {
                              ...cal,
                              lastSyncSuccess: res?.success !== false,
                              lastError:
                                  res?.success === false
                                      ? (res?.error ?? "Sync failed")
                                      : null,
                          }
                        : cal,
                ),
            );
        } catch (err: any) {
            setCalendars((prev) =>
                prev.map((cal) =>
                    cal.id === c.id
                        ? {
                              ...cal,
                              lastSyncSuccess: false,
                              lastError: err.message ?? "Sync error",
                          }
                        : cal,
                ),
            );
        } finally {
            await loadAll();
            setSyncingId(null);
        }
    };

    const doTest = async (c: CalendarData) => {
        setTestingId(c.id);
        try {
            const res = await apiClient.post("/api/calendars/test-connection", {
                type: c.type,
                config: c.config,
            });
            setCalendars((prev) =>
                prev.map((cal) =>
                    cal.id === c.id
                        ? {
                              ...cal,
                              lastTestSuccess: res.success,
                              lastError: res.success
                                  ? null
                                  : (res.error ?? "Test failed"),
                          }
                        : cal,
                ),
            );
        } catch (err: any) {
            setCalendars((prev) =>
                prev.map((cal) =>
                    cal.id === c.id
                        ? {
                              ...cal,
                              lastTestSuccess: false,
                              lastError: err.message ?? "Network error",
                          }
                        : cal,
                ),
            );
        } finally {
            setTestingId(null);
        }
    };

    const openExportLink = (
        type: "all" | "calendar" | "friend",
        id?: string,
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
        setShowExport(true);
        setCopied(false);
    };

    const doCopy = () => {
        navigator.clipboard.writeText(exportLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

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
                                    <div className={s.rowName}>
                                        {c.name}
                                        {(c.lastTestSuccess === false ||
                                            c.lastSyncSuccess === false) && (
                                            <span
                                                className={s.rowFailedDot}
                                                title={
                                                    c.lastError ||
                                                    "Last sync or connection test failed"
                                                }
                                            />
                                        )}
                                    </div>
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
                                </div>
                                <div className={s.rowActions}>
                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() =>
                                            openExportLink("calendar", c.id)
                                        }
                                    >
                                        <Link size={12} />
                                    </button>

                                    {c.type === "ics" && (
                                        <button
                                            className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                            onClick={() => doTest(c)}
                                            disabled={testingId === c.id}
                                            title="Test Connection"
                                        >
                                            {testingId === c.id ? (
                                                <RefreshCw
                                                    size={12}
                                                    className={s.spin}
                                                />
                                            ) : (
                                                <Check size={12} />
                                            )}
                                        </button>
                                    )}

                                    {c.type === "ics" && (
                                        <button
                                            className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                            onClick={() => doSync(c)}
                                            disabled={syncingId === c.id}
                                            title="Sync Calendar"
                                        >
                                            <RefreshCw size={12} />
                                        </button>
                                    )}

                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() => copyCalendar(c)}
                                        title="Duplicate calendar"
                                    >
                                        <Copy size={12} />
                                    </button>

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
                                Copied to clipboard
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
