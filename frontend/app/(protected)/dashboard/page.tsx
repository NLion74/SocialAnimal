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
    Share2,
    Copy,
} from "lucide-react";
import { apiClient } from "../../../lib/api";
import type { CalendarData, Friend, Permission } from "../../../lib/types";
import s from "./page.module.css";
import { env } from "../../../lib/env";
import Modal from "../../../components/Modal";
import GoogleCalendarSelect from "../../../components/GoogleCalendarSelect";
import ServerCalendarSelect from "../../../components/ServerCalendarSelect";

type ImportType = "ics" | "caldav" | "icloud" | "google";

interface GoogleCalendar {
    id: string;
    summary: string;
}

interface DiscoveredCalendar {
    url: string;
    displayName: string;
    color?: string;
}

type ServerSelectType = "caldav" | "icloud";

type CaldavCredentials = {
    url: string;
    username: string;
    password: string;
};

type IcloudCredentials = {
    username: string;
    password: string;
};

type ServerCredentials = CaldavCredentials | IcloudCredentials;

const PERM_LABELS: Record<Permission, string> = {
    busy: "Busy Only",
    titles: "Titles Only",
    full: "Full Details",
};

interface IncomingShare {
    friendshipId: string;
    calendarId: string;
    calendarName: string;
    ownerName: string;
    ownerEmail: string;
    permission: Permission;
    ownerId: string;
}

export default function DashboardPage() {
    const [calendars, setCalendars] = useState<CalendarData[]>([]);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [incomingShares, setIncomingShares] = useState<IncomingShare[]>([]);
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
    const [error, setError] = useState("");

    const [googleLoading, setGoogleLoading] = useState(false);
    const [showGoogleSelect, setShowGoogleSelect] = useState(false);
    const [googleToken, setGoogleToken] = useState("");
    const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendar[]>(
        [],
    );
    const [importedGoogleIds, setImportedGoogleIds] = useState<string[]>([]);
    const [selectedGoogleIds, setSelectedGoogleIds] = useState<string[]>([]);
    const [googleSelectLoading, setGoogleSelectLoading] = useState(false);
    const [googleImporting, setGoogleImporting] = useState(false);

    const [showServerSelect, setShowServerSelect] = useState(false);
    const [serverSelectType, setServerSelectType] =
        useState<ServerSelectType | null>(null);
    const [serverCredentials, setServerCredentials] =
        useState<ServerCredentials | null>(null);
    const [discoveredCalendars, setDiscoveredCalendars] = useState<
        DiscoveredCalendar[]
    >([]);
    const [selectedCalendarUrls, setSelectedCalendarUrls] = useState<string[]>(
        [],
    );
    const [discoveringCalendars, setDiscoveringCalendars] = useState(false);
    const [serverImporting, setServerImporting] = useState(false);
    const [serverError, setServerError] = useState("");

    const [copied, setCopied] = useState(false);
    const [exportCtx, setExportCtx] = useState<{
        title: string;
        subtitle?: string;
        link: string;
    } | null>(null);

    const uid = apiClient.getUid();

    useEffect(() => {
        loadAll();
        checkGoogleCallback();
    }, []);

    useEffect(() => {
        if (!editingCalendar) {
            resetForm();
            return;
        }
        setName(editingCalendar.name);
        setUrl(editingCalendar.config?.url || "");
        setUsername(editingCalendar.config?.username || "");
        setPassword(editingCalendar.config?.password || "");
        setSync(editingCalendar.syncInterval ?? 60);
    }, [editingCalendar]);

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
            setIncomingShares(deriveIncomingShares(frRaw, uid as string));
        } finally {
            setLoading(false);
        }
    };

    const deriveIncomingShares = (
        frRaw: Friend[],
        currentUid: string,
    ): IncomingShare[] => {
        const shares: IncomingShare[] = [];
        for (const f of frRaw) {
            if (f.status !== "accepted") continue;
            const owner = f.user1.id === currentUid ? f.user2 : f.user1;
            for (const cal of f.sharedWithMe ?? []) {
                shares.push({
                    friendshipId: f.id,
                    calendarId: cal.id,
                    calendarName: cal.name,
                    ownerName: owner.name ?? "",
                    ownerEmail: owner.email,
                    permission: cal.permission ?? "full",
                    ownerId: owner.id,
                });
            }
        }
        return shares;
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

    const saveServerEditing = async () => {
        if (!editingCalendar) return;

        setSaving(true);
        setError("");

        const existingUrl = editingCalendar.config?.url || url;

        const config = {
            url: existingUrl,
            username,
            password,
        };

        try {
            await apiClient.request(`/api/calendars/${editingCalendar.id}`, {
                method: "PUT",
                body: { name, syncInterval: sync, config },
            });

            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const discoverAndOpenSelect = async (type: ServerSelectType) => {
        setDiscoveringCalendars(true);
        setServerError("");
        setError("");

        const creds: ServerCredentials =
            type === "caldav"
                ? { url, username, password }
                : { username, password };

        try {
            const endpoint =
                type === "caldav"
                    ? "/api/import/caldav/discover"
                    : "/api/import/icloud/discover";

            const res = await apiClient.post<{
                calendars: DiscoveredCalendar[];
            }>(endpoint, creds);

            const found = res?.calendars ?? [];

            if (found.length === 0 && type === "caldav") {
                setError(
                    "No calendars discovered. If your server blocks discovery, paste a direct calendar URL and use Direct Import.",
                );
                return;
            }

            setDiscoveredCalendars(found);
            setSelectedCalendarUrls([]);
            setServerCredentials(creds);
            setServerSelectType(type);

            closeModal();
            setShowServerSelect(true);
        } catch (e: any) {
            setError(e.message || "Failed to discover calendars");
        } finally {
            setDiscoveringCalendars(false);
        }
    };

    const importDirectCaldav = async () => {
        if (!name || !url) {
            setError("Name and URL are required for direct import.");
            return;
        }

        setSaving(true);
        setError("");

        const payload = {
            credentials: { url, username, password },
            calendars: [{ name, url }],
        };

        try {
            await apiClient.post("/api/import/caldav", payload);
            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Failed to import calendar");
        } finally {
            setSaving(false);
        }
    };

    const closeServerSelect = () => {
        setShowServerSelect(false);
        setServerSelectType(null);
        setServerCredentials(null);
        setDiscoveredCalendars([]);
        setSelectedCalendarUrls([]);
        setServerError("");
    };

    const toggleServerCalendar = (u: string) => {
        setSelectedCalendarUrls((prev) =>
            prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u],
        );
    };

    const selectAllServer = () =>
        setSelectedCalendarUrls(discoveredCalendars.map((c) => c.url));

    const deselectAllServer = () => setSelectedCalendarUrls([]);

    const importSelectedServer = async () => {
        if (
            !serverCredentials ||
            !serverSelectType ||
            selectedCalendarUrls.length === 0
        )
            return;

        setServerImporting(true);
        setServerError("");

        try {
            const calendarsPayload = selectedCalendarUrls.map((u) => ({
                name:
                    discoveredCalendars.find((c) => c.url === u)?.displayName ??
                    u,
                url: u,
            }));

            const endpoint =
                serverSelectType === "caldav"
                    ? "/api/import/caldav"
                    : "/api/import/icloud";

            const body = {
                credentials: serverCredentials,
                calendars: calendarsPayload,
            };

            await apiClient.post(endpoint, body);

            closeServerSelect();
            alert(
                `Successfully imported ${selectedCalendarUrls.length} calendar${
                    selectedCalendarUrls.length !== 1 ? "s" : ""
                }!`,
            );
            await loadAll();
        } catch (e: any) {
            setServerError(e.message || "Failed to import calendars");
        } finally {
            setServerImporting(false);
        }
    };

    const checkGoogleCallback = () => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("googleToken");
        const status = params.get("googleAuthSuccess");

        if (token && status === "success") {
            setGoogleToken(token);
            openGoogleSelect(token);
            window.history.replaceState({}, "", "");
            return;
        }

        if (status === "error") {
            alert(
                `Google authentication failed: ${
                    params.get("reason") || "Unknown error"
                }`,
            );
            window.history.replaceState({}, "", "");
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
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        );
    };

    const selectAllGoogle = () => {
        const availableIds = googleCalendars
            .filter((cal) => !importedGoogleIds.includes(cal.id))
            .map((cal) => cal.id);
        setSelectedGoogleIds(availableIds);
    };

    const deselectAllGoogle = () => setSelectedGoogleIds([]);

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

    const saveGoogleCalendar = async () => {
        if (!name || !editingCalendar) return;

        setSaving(true);
        setError("");

        try {
            await apiClient.request(`/api/calendars/${editingCalendar.id}`, {
                method: "PUT",
                body: { name, syncInterval: sync },
            });

            closeModal();
            await loadAll();
        } catch (e: any) {
            setError(e.message || "Failed to save calendar");
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

    const openExport = (
        title: string,
        subtitle: string | undefined,
        type: "all" | "calendar" | "friend",
        id?: string,
        calendarId?: string,
    ) => {
        const token = localStorage.getItem("token");
        if (!token) return;

        const base = env.ICS_BASE_URL;
        const t = encodeURIComponent(token);

        const link =
            type === "all"
                ? `${base}/api/export/subscription/ics/my-calendar.ics?token=${t}`
                : type === "calendar"
                  ? `${base}/api/export/subscription/ics/calendar/${id}.ics?token=${t}`
                  : `${base}/api/export/subscription/ics/friend/${id}/${calendarId}.ics?token=${t}`;

        setExportCtx({ title, subtitle, link });
        setCopied(false);
    };

    const doCopy = () => {
        if (!exportCtx) return;
        navigator.clipboard.writeText(exportCtx.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const activeImportType = editingCalendar
        ? (editingCalendar.type as ImportType)
        : importType;

    const accepted = friends.filter((f) => f.status === "accepted");
    const total = calendars.reduce((n, c) => n + (c.events?.length || 0), 0);

    if (loading) {
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
                <span>Loading...</span>
            </div>
        );
    }

    return (
        <div className={s.page}>
            <div className={s.pageHeader}>
                <h1 className={s.pageTitle}>Dashboard</h1>
                <div className={s.btnRow}>
                    <button
                        className={`${s.btn} ${s.btnSecondary}`}
                        onClick={() =>
                            openExport("My Calendars", undefined, "all")
                        }
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
                                            openExport(
                                                c.name,
                                                `${c.events?.length || 0} events`,
                                                "calendar",
                                                c.id,
                                            )
                                        }
                                        title="Export ICS link"
                                    >
                                        <Link size={12} />
                                    </button>

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

            <div className={s.section}>
                <div className={s.sectionHeader}>
                    <span className={s.sectionTitle}>
                        Shared with you ({incomingShares.length})
                    </span>
                </div>

                {incomingShares.length === 0 ? (
                    <div className={s.empty}>
                        <Share2 size={38} className={s.emptyIcon} />
                        <span>No calendars shared with you yet</span>
                    </div>
                ) : (
                    <div className={s.list}>
                        {incomingShares.map((share) => (
                            <div
                                key={`${share.friendshipId}-${share.calendarId}`}
                                className={s.row}
                            >
                                <div className={s.rowInfo}>
                                    <div className={s.rowName}>
                                        {share.calendarName}
                                    </div>
                                    <div className={s.rowMeta}>
                                        <span className={s.metaText}>
                                            {share.ownerName ||
                                                share.ownerEmail}
                                        </span>
                                        <span className={s.permLabel}>
                                            {PERM_LABELS[share.permission]}
                                        </span>
                                    </div>
                                </div>

                                <div className={s.rowActions}>
                                    <button
                                        className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                        onClick={() =>
                                            openExport(
                                                share.calendarName,
                                                share.ownerName ||
                                                    share.ownerEmail,
                                                "friend",
                                                share.ownerId,
                                                share.calendarId,
                                            )
                                        }
                                        title="Export ICS link"
                                    >
                                        <Link size={12} />
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
                        {(
                            [
                                "ics",
                                "caldav",
                                "icloud",
                                "google",
                            ] as ImportType[]
                        ).map((type) => (
                            <button
                                key={type}
                                className={`${s.typeBtn} ${importType === type ? s.typeTabActive : ""}`}
                                onClick={() => setImportType(type)}
                            >
                                <div className={s.typeName}>
                                    {
                                        {
                                            ics: "ICS / iCal Link",
                                            caldav: "CalDAV",
                                            icloud: "iCloud",
                                            google: "Google Calendar",
                                        }[type]
                                    }
                                </div>
                                <div className={s.typeDesc}>
                                    {
                                        {
                                            ics: "Import from ICS/iCal URL",
                                            caldav: "Connect a CalDAV server",
                                            icloud: "Connect Apple iCloud",
                                            google: "Connect your Google account",
                                        }[type]
                                    }
                                </div>
                            </button>
                        ))}
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

                {activeImportType === "caldav" && editingCalendar && (
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
                            <label className={s.fieldLabel}>CalDAV URL</label>
                            <input className={s.input} value={url} disabled />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>Username</label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>Password</label>
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

                        <p className={s.hint}>
                            URL cannot be changed. Delete and re-import if
                            needed.
                        </p>

                        {error && <div className={s.error}>{error}</div>}

                        <div className={s.formRow}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={saveServerEditing}
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

                {activeImportType === "caldav" && !editingCalendar && (
                    <div className={s.formStack}>
                        <div>
                            <label className={s.fieldLabel}>Name</label>
                            <input
                                className={s.input}
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Used for direct import"
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>CalDAV URL</label>
                            <input
                                className={s.input}
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://caldav.example.com/ or direct calendar URL"
                            />
                        </div>

                        <p className={s.hint}>
                            Server root (auto-discovers):
                            <br />
                            <span
                                style={{
                                    fontFamily: "ui-monospace, monospace",
                                }}
                            >
                                https://caldav.example.com/
                            </span>
                            <br />
                            <br />
                            Direct calendar (fallback):
                            <br />
                            <span
                                style={{
                                    fontFamily: "ui-monospace, monospace",
                                }}
                            >
                                https://caldav.icloud.com/12345678/calendars/personal/
                            </span>
                        </p>

                        <div>
                            <label className={s.fieldLabel}>Username</label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>Password</label>
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

                        <div className={s.formRow} style={{ gap: 8 }}>
                            <button
                                className={`${s.btn} ${s.btnPrimary}`}
                                style={{ flex: 1 }}
                                onClick={() => discoverAndOpenSelect("caldav")}
                                disabled={discoveringCalendars}
                            >
                                {discoveringCalendars ? (
                                    <>
                                        <Loader2 size={14} className={s.spin} />{" "}
                                        Discovering…
                                    </>
                                ) : (
                                    "Discover Calendars"
                                )}
                            </button>

                            <button
                                className={`${s.btn} ${s.btnSecondary}`}
                                onClick={importDirectCaldav}
                                disabled={saving}
                                title="Use this when discovery is blocked and you have a direct calendar URL"
                            >
                                {saving ? "Importing…" : "Direct Import"}
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

                {activeImportType === "icloud" && editingCalendar && (
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
                            <label className={s.fieldLabel}>Apple ID</label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="you@icloud.com"
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                App-specific password
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
                                onClick={saveServerEditing}
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

                {activeImportType === "icloud" && !editingCalendar && (
                    <div className={s.formStack}>
                        <div>
                            <label className={s.fieldLabel}>Apple ID</label>
                            <input
                                className={s.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="you@icloud.com"
                            />
                        </div>

                        <div>
                            <label className={s.fieldLabel}>
                                App-specific password
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

                        <p className={s.hint}>
                            Generate an app-specific password at
                            appleid.apple.com under Security.
                        </p>

                        {error && <div className={s.error}>{error}</div>}

                        <button
                            className={`${s.btn} ${s.btnPrimary}`}
                            style={{ flex: 1 }}
                            onClick={() => discoverAndOpenSelect("icloud")}
                            disabled={discoveringCalendars}
                        >
                            {discoveringCalendars ? (
                                <>
                                    <Loader2 size={14} className={s.spin} />{" "}
                                    Discovering…
                                </>
                            ) : (
                                "Discover Calendars"
                            )}
                        </button>
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

            <ServerCalendarSelect
                isOpen={showServerSelect}
                onClose={closeServerSelect}
                loading={false}
                error={serverError}
                calendars={discoveredCalendars}
                selectedUrls={selectedCalendarUrls}
                onToggle={toggleServerCalendar}
                onSelectAll={selectAllServer}
                onDeselectAll={deselectAllServer}
                onImport={importSelectedServer}
                importing={serverImporting}
                title={
                    serverSelectType === "icloud"
                        ? "Select iCloud Calendars"
                        : "Select CalDAV Calendars"
                }
            />

            <Modal
                isOpen={!!exportCtx}
                onClose={() => setExportCtx(null)}
                title="Export Calendar"
            >
                <div className={s.formStack}>
                    <div>
                        <label className={s.fieldLabel}>Calendar</label>
                        <div className={s.inputStatic}>
                            {exportCtx?.title ?? ""}
                        </div>
                        {exportCtx?.subtitle && (
                            <p className={s.hint}>{exportCtx.subtitle}</p>
                        )}
                    </div>

                    <div>
                        <label className={s.fieldLabel}>Type</label>
                        <div className={s.inputStatic}>ICS iCal</div>
                    </div>

                    <div>
                        <label className={s.fieldLabel}>
                            Subscription link
                        </label>
                        <input
                            className={s.input}
                            value={exportCtx?.link ?? ""}
                            readOnly
                            onFocus={(e) => e.target.select()}
                            style={{
                                fontFamily: "ui-monospace, monospace",
                                fontSize: 12,
                            }}
                        />
                        <p className={s.hint}>
                            Use this link to subscribe in other apps. Do not
                            share it: it contains a secret token that grants
                            access to your calendar data.
                        </p>
                    </div>

                    <div className={s.formRow}>
                        <button
                            className={`${s.btn} ${s.btnPrimary}`}
                            style={{ flex: 1 }}
                            onClick={doCopy}
                        >
                            {copied ? (
                                <>
                                    <Check size={14} /> Copied
                                </>
                            ) : (
                                <>
                                    <Copy size={14} /> Copy link
                                </>
                            )}
                        </button>
                        <button
                            className={`${s.btn} ${s.btnSecondary}`}
                            onClick={() => setExportCtx(null)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
