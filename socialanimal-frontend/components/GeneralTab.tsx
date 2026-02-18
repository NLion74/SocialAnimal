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
} from "lucide-react";
import { env } from "@/lib/env";
import s from "./GeneralTab.module.css";
import { useCallback } from "react";

interface CalendarData {
    id: string;
    name: string;
    type: string;
    url?: string;
    events: { id: string; title: string }[];
    lastSync?: string;
}
interface Friend {
    id: string;
    user1: { id: string; email: string; name?: string };
    user2: { id: string; email: string; name?: string };
    status: string;
    sharedCalendarIds: string[];
    sharedWithMe: { id: string; name: string }[];
}

const TYPES = [
    {
        value: "ics_url",
        label: "ICS / iCal URL",
        desc: "Import from any public ICS URL",
        enabled: true,
    },
    {
        value: "google",
        label: "Google Calendar",
        desc: "Coming soon",
        enabled: false,
    },
    {
        value: "apple",
        label: "Apple Calendar",
        desc: "Coming soon",
        enabled: false,
    },
    {
        value: "proton",
        label: "Proton Calendar",
        desc: "Coming soon",
        enabled: false,
    },
];

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

    const [showImport, setShowImport] = useState(false);
    const [selType, setSelType] = useState<string | null>(null);
    const [impName, setImpName] = useState("");
    const [impUrl, setImpUrl] = useState("");
    const [importing, setImporting] = useState(false);
    const [impErr, setImpErr] = useState("");

    const [showExport, setShowExport] = useState(false);
    const [exportLink, setExportLink] = useState("");
    const [exportLabel, setExportLabel] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        load();
    }, []);

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

    const closeImport = () => {
        setShowImport(false);
        setSelType(null);
        setImpName("");
        setImpUrl("");
        setImpErr("");
    };

    const doImport = async () => {
        if (!selType || !impName || (selType === "ics_url" && !impUrl)) return;
        setImporting(true);
        setImpErr("");
        try {
            const r = await api("/api/calendars", {
                method: "POST",
                body: JSON.stringify({
                    name: impName,
                    type: selType,
                    url: impUrl || null,
                }),
            });
            if (!r.ok)
                throw new Error((await r.json()).error || "Import failed");
            closeImport();
            load();
        } catch (e) {
            setImpErr(e instanceof Error ? e.message : "Import failed");
        } finally {
            setImporting(false);
        }
    };

    const doSync = async (id: string) => {
        setSyncingId(id);
        await api(`/api/calendars/${id}/sync`, { method: "POST" });
        load();
        setSyncingId(null);
    };

    const doDelete = async (id: string) => {
        if (!confirm("Delete this calendar and all its events?")) return;
        await api(`/api/calendars/${id}`, { method: "DELETE" });
        load();
    };

    const openExport = (
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
                        onClick={() => openExport("all")}
                    >
                        <Link size={14} /> Export All
                    </button>
                    <button
                        className={`${s.btn} ${s.btnPrimary}`}
                        onClick={() => setShowImport(true)}
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
                        onClick={() => setShowImport(true)}
                    >
                        <Plus size={12} /> Add
                    </button>
                </div>

                {calendars.length === 0 ? (
                    <div className={s.empty}>
                        <Calendar size={38} className={s.emptyIcon} />
                        <span>
                            No calendars yet — import one to get started
                        </span>
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
                                            openExport("calendar", c.id, c.name)
                                        }
                                        title="Get ICS link"
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
                                            {syncingId === c.id
                                                ? "Syncing…"
                                                : "Sync"}
                                        </button>
                                    )}
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

            {accepted.length > 0 && (
                <div className={s.section}>
                    <div className={s.sectionHeader}>
                        <span className={s.sectionTitle}>
                            Friends' Calendars
                        </span>
                    </div>
                    <div className={s.list}>
                        {accepted.map((f) => {
                            const friend =
                                f.user1.id === uid ? f.user2 : f.user1;
                            const shared = f.sharedWithMe ?? [];

                            return (
                                <div key={f.id} className={s.row}>
                                    <div className={s.rowInfo}>
                                        <div className={s.rowName}>
                                            {friend.name || friend.email}
                                        </div>
                                        <div className={s.rowMeta}>
                                            <span className={s.metaText}>
                                                {friend.email}
                                            </span>
                                            {shared.length === 0 && (
                                                <span className={s.metaText}>
                                                    No calendars shared with you
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {shared.length > 0 && (
                                        <div className={s.rowActions}>
                                            {shared.map((cal) => (
                                                <button
                                                    key={cal.id}
                                                    className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                                    onClick={() =>
                                                        openExport(
                                                            "calendar",
                                                            cal.id,
                                                            `${friend.name || friend.email} – ${cal.name}`,
                                                        )
                                                    }
                                                >
                                                    <Link size={12} />{" "}
                                                    {cal.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {showImport && (
                <div className={s.overlay} onClick={closeImport}>
                    <div
                        className={s.modal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={s.modalHeader}>
                            <span className={s.modalTitle}>
                                Import Calendar
                            </span>
                            <button
                                className={s.closeBtn}
                                onClick={closeImport}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {!selType ? (
                            <div className={s.typeGrid}>
                                {TYPES.map((t) => (
                                    <button
                                        key={t.value}
                                        className={s.typeBtn}
                                        disabled={!t.enabled}
                                        onClick={() =>
                                            t.enabled && setSelType(t.value)
                                        }
                                    >
                                        <div className={s.typeName}>
                                            {t.label}
                                        </div>
                                        <div className={s.typeDesc}>
                                            {t.desc}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className={s.formStack}>
                                <button
                                    className={s.backBtn}
                                    onClick={() => setSelType(null)}
                                >
                                    ← Back
                                </button>
                                <div>
                                    <label className={s.fieldLabel}>
                                        Calendar Name
                                    </label>
                                    <input
                                        className={s.input}
                                        type="text"
                                        value={impName}
                                        onChange={(e) =>
                                            setImpName(e.target.value)
                                        }
                                        placeholder="My Calendar"
                                    />
                                </div>
                                <div>
                                    <label className={s.fieldLabel}>
                                        ICS URL
                                    </label>
                                    <input
                                        className={s.input}
                                        type="url"
                                        value={impUrl}
                                        onChange={(e) =>
                                            setImpUrl(e.target.value)
                                        }
                                        placeholder="https://example.com/calendar.ics"
                                        onKeyDown={(e) =>
                                            e.key === "Enter" && doImport()
                                        }
                                    />
                                    <div className={s.hint}>
                                        Any public ICS/iCal URL — Google,
                                        Outlook, Fastmail, etc.
                                    </div>
                                </div>
                                {impErr && (
                                    <div className={s.error}>{impErr}</div>
                                )}
                                <div className={s.formRow}>
                                    <button
                                        className={`${s.btn} ${s.btnPrimary}`}
                                        style={{ flex: 1 }}
                                        onClick={doImport}
                                        disabled={
                                            importing || !impName || !impUrl
                                        }
                                    >
                                        {importing ? "Importing…" : "Import"}
                                    </button>
                                    <button
                                        className={`${s.btn} ${s.btnSecondary}`}
                                        onClick={closeImport}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
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
                        <p className={s.hint} style={{ marginBottom: "1rem" }}>
                            Subscribe to{" "}
                            <strong style={{ color: "var(--text-primary)" }}>
                                {exportLabel}
                            </strong>{" "}
                            in any calendar app. This link stays live and always
                            reflects the latest events.
                        </p>
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
