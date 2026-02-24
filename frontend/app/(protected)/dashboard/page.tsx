"use client";

import { useState, useEffect } from "react";
import {
    Plus,
    RefreshCw,
    Trash2,
    Check,
    Link,
    Calendar,
    Edit,
    Loader2,
} from "lucide-react";
import { apiClient } from "../../../lib/api";
import type { CalendarData, Friend } from "../../../lib/types";
import s from "./page.module.css";
import { env } from "../../../lib/env";
import Modal from "../../../components/Modal";
import ExportLinkModal from "../../../components/ExportLinkModal";
import GoogleCalendarSelect from "../../../components/GoogleCalendarSelect";

type ImportType = "ics" | "google";

interface GoogleCalendar {
    id: string;
    summary: string;
}

export default function DashboardPage() {
    const [calendars, setCalendars] = useState<CalendarData[]>([]);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [testingId, setTestingId] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editingCalendar, setEditingCalendar] = useState<CalendarData | null>(
        null,
    );
    const [importType, setImportType] = useState<ImportType>("ics");
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [sync, setSync] = useState(60);
    const [saving, setSaving] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [error, setError] = useState("");
    const [showGoogleSelect, setShowGoogleSelect] = useState(false);
    const [googleToken, setGoogleToken] = useState("");
    const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>(
        [],
    );
    const [importedGoogleIds, setImportedGoogleIds] = useState<string[]>([]);
    const [selectedGoogleIds, setSelectedGoogleIds] = useState<string[]>([]);
    const [googleSelectLoading, setGoogleSelectLoading] = useState(false);
    const [googleImporting, setGoogleImporting] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const [exportLink, setExportLink] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        loadAll();
        checkGoogleCallback();
    }, []);

    useEffect(() => {
        if (editingCalendar) {
            setName(editingCalendar.name);
            setUrl(editingCalendar.config?.url || "");
            setUsername(editingCalendar.config?.username || "");
            setPassword(editingCalendar.config?.password || "");
            setSync(editingCalendar.syncInterval ?? 60);
        } else {
            resetForm();
        }
    }, [editingCalendar]);

    const checkGoogleCallback = () => {
        const params = new URLSearchParams(window.location.search);
        const googleToken = params.get("googleToken");
        const googleAuthSuccess = params.get("googleAuthSuccess");
        if (googleToken && googleAuthSuccess === "success") {
            setGoogleToken(googleToken);
            openGoogleSelect(googleToken);
            window.history.replaceState({}, "", "");
        } else if (googleAuthSuccess === "error") {
            const reason = params.get("reason");
            alert(`Google authentication failed: ${reason || "Unknown error"}`);
            window.history.replaceState({}, "", "");
        }
    };

    const resetForm = () => {
        setName("");
        setUrl("");
        setUsername("");
        setPassword("");
        setSync(60);
        setError("");
        setImportType("ics");
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

    const saveIcsCalendar = async () => {
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
                "/api/import/test-connection",
                {
                    type: "ics",
                    config,
                },
            );
            if (!testRes?.success) {
                setError(testRes?.error || "Connection test failed");
                return;
            }
            if (editingCalendar) {
                await apiClient.request(
                    `/api/calendars/${editingCalendar.id}`,
                    {
                        method: "PUT",
                        body: { name, syncInterval: sync, config },
                    },
                );
            } else {
                await apiClient.post("/api/import/ics", { name, url, config });
            }
            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Test or save failed");
        } finally {
            setSaving(false);
        }
    };

    const saveGoogleCalendar = async () => {
        if (!name || !editingCalendar) return;
        setSaving(true);
        setError("");
        try {
            await apiClient.request(`/api/calendars/${editingCalendar.id}`, {
                method: "PUT",
                body: {
                    name,
                    syncInterval: sync,
                },
            });
            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Failed to save calendar");
        } finally {
            setSaving(false);
        }
    };

    const connectGoogle = async () => {
        setGoogleLoading(true);
        setError("");
        try {
            const res = await apiClient.request<{ url: string }>(
                "/api/import/google/auth-url",
            );
            window.location.href = res.url;
        } catch (err: any) {
            setError(err.message || "Failed to get Google auth URL");
            setGoogleLoading(false);
        }
    };

    const openGoogleSelect = async (token: string) => {
        setShowModal(false);
        setShowGoogleSelect(true);
        setGoogleToken(token);
        setGoogleSelectLoading(true);
        setError("");
        try {
            const [calendarsRes, importedRes] = await Promise.all([
                apiClient.post<{ calendars: GoogleCalendar[] }>(
                    "/api/import/google/list",
                    { token },
                ),
                apiClient.request<{ importedCalendarIds: string[] }>(
                    "/api/import/google/imported",
                ),
            ]);
            setGoogleCalendars(calendarsRes.calendars);
            setImportedGoogleIds(importedRes.importedCalendarIds);
        } catch (err: any) {
            setError(err.message || "Failed to load calendars");
        } finally {
            setGoogleSelectLoading(false);
        }
    };

    const closeGoogleSelect = () => {
        setShowGoogleSelect(false);
        setGoogleToken("");
        setGoogleCalendars([]);
        setSelectedGoogleIds([]);
        setError("");
    };

    const toggleGoogleCalendar = (id: string) => {
        if (importedGoogleIds.includes(id)) return;
        setSelectedGoogleIds((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
        );
    };

    const selectAllGoogle = () => {
        const availableIds = googleCalendars
            .filter((cal) => !importedGoogleIds.includes(cal.id))
            .map((cal) => cal.id);
        setSelectedGoogleIds(availableIds);
    };

    const deselectAllGoogle = () => {
        setSelectedGoogleIds([]);
    };

    const importSelectedGoogle = async () => {
        if (!googleToken || selectedGoogleIds.length === 0) return;
        setGoogleImporting(true);
        setError("");
        try {
            await apiClient.post("/api/import/google/import", {
                token: googleToken,
                calendarIds: selectedGoogleIds,
            });
            closeGoogleSelect();
            alert(
                `Successfully imported ${selectedGoogleIds.length} calendar${
                    selectedGoogleIds.length !== 1 ? "s" : ""
                }!`,
            );
            await loadAll();
        } catch (err: any) {
            setError(err.message || "Failed to import calendars");
        } finally {
            setGoogleImporting(false);
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
            const res = await apiClient.request(`/api/calendars/${c.id}/test`);
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

    const activeImportType = editingCalendar
        ? (editingCalendar.type as ImportType)
        : importType;
    const accepted = friends.filter((f) => f.status === "accepted");
    const total = calendars.reduce((n, c) => n + (c.events?.length || 0), 0);

    if (loading)
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
                <span>Loading...</span>
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
                                        title="Export ICS Link"
                                    >
                                        <Link size={12} />
                                    </button>

                                    <>
                                        <button
                                            className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                            onClick={() => doTest(c)}
                                            disabled={testingId === c.id}
                                            title="Test Connection"
                                        >
                                            {testingId === c.id ? (
                                                <Loader2
                                                    size={12}
                                                    className={s.spin}
                                                />
                                            ) : (
                                                <Check size={12} />
                                            )}
                                        </button>

                                        <button
                                            className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                            onClick={() => doSync(c)}
                                            disabled={syncingId === c.id}
                                            title="Sync Calendar"
                                        >
                                            {syncingId === c.id ? (
                                                <Loader2
                                                    size={12}
                                                    className={s.spin}
                                                />
                                            ) : (
                                                <RefreshCw size={12} />
                                            )}
                                        </button>
                                    </>

                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() => openEdit(c)}
                                        title="Edit calendar"
                                    >
                                        <Edit size={12} />
                                    </button>

                                    <button
                                        className={`${s.btn} ${s.btnDanger} ${s.btnSm} ${s.btnIcon}`}
                                        onClick={() => doDelete(c.id)}
                                        title="Delete calendar"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Modal
                isOpen={showModal}
                onClose={closeModal}
                title={editingCalendar ? "Edit Calendar" : "Import Calendar"}
            >
                {!editingCalendar && (
                    <div className={s.typeGrid}>
                        <button
                            className={`${s.typeBtn} ${importType === "ics" ? s.typeTabActive : ""}`}
                            onClick={() => setImportType("ics")}
                        >
                            <div className={s.typeName}>ICS / WebCal</div>
                            <div className={s.typeDesc}>
                                Import from ICS/iCal URL
                            </div>
                        </button>
                        <button
                            className={`${s.typeBtn} ${importType === "google" ? s.typeTabActive : ""}`}
                            onClick={() => setImportType("google")}
                        >
                            <div className={s.typeName}>Google Calendar</div>
                            <div className={s.typeDesc}>
                                Connect your Google account
                            </div>
                        </button>
                    </div>
                )}

                {activeImportType === "ics" && (
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
                                disabled={!!editingCalendar}
                            />
                        </div>
                        <div>
                            <label className={s.fieldLabel}>
                                Username (optional)
                            </label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
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
                                onChange={(e) => setPassword(e.target.value)}
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
                                onClick={saveIcsCalendar}
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
                )}

                {activeImportType === "google" && !editingCalendar && (
                    <div className={s.formStack}>
                        <p className={s.hint}>
                            Connect your Google account to select which
                            calendars to import. You will be redirected to
                            Google to authorize access.
                        </p>
                        {error && <div className={s.error}>{error}</div>}
                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={connectGoogle}
                                disabled={googleLoading}
                            >
                                {googleLoading
                                    ? "Redirecting…"
                                    : "Connect with Google"}
                            </button>
                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={closeModal}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {activeImportType === "google" && editingCalendar && (
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
                        <p className={s.hint}>
                            Google Calendar URL cannot be changed. Delete and
                            re-import if needed.
                        </p>
                        {error && <div className={s.error}>{error}</div>}
                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={saveGoogleCalendar}
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
                )}
            </Modal>

            <GoogleCalendarSelect
                isOpen={showGoogleSelect}
                onClose={closeGoogleSelect}
                loading={googleSelectLoading}
                error={error}
                calendars={googleCalendars}
                importedIds={importedGoogleIds}
                selectedIds={selectedGoogleIds}
                onToggle={toggleGoogleCalendar}
                onSelectAll={selectAllGoogle}
                onDeselectAll={deselectAllGoogle}
                onImport={importSelectedGoogle}
                importing={googleImporting}
            />

            <ExportLinkModal
                isOpen={showExport}
                onClose={() => setShowExport(false)}
                link={exportLink}
                copied={copied}
                onCopy={doCopy}
            />
        </div>
    );
}
