"use client";
import { useState, useEffect, useCallback } from "react";
import { UserPlus, X, Check, ChevronDown, ChevronUp, Link } from "lucide-react";
import { env } from "@/lib/env";
import s from "./FriendsTab.module.css";

interface FriendUser {
    id: string;
    email: string;
    name?: string;
}
interface Friendship {
    id: string;
    user1Id: string;
    user1: FriendUser;
    user2Id: string;
    user2: FriendUser;
    status: string;
    createdAt: string;
    sharedCalendarIds?: string[];
}
interface CalendarData {
    id: string;
    name: string;
    type: string;
}

function getUid(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return JSON.parse(atob(localStorage.getItem("token") ?? "")).sub;
    } catch {
        return null;
    }
}

export default function FriendsTab() {
    const [friends, setFriends] = useState<Friendship[]>([]);
    const [calendars, setCalendars] = useState<CalendarData[]>([]);
    const [loading, setLoading] = useState(true);

    // Add friend modal
    const [showAdd, setShowAdd] = useState(false);
    const [addEmail, setAddEmail] = useState("");
    const [addErr, setAddErr] = useState("");
    const [addBusy, setAddBusy] = useState(false);

    // Share panel open state per friendship
    const [openShare, setOpenShare] = useState<string | null>(null);

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

    const load = useCallback(async () => {
        setLoading(true);
        const [fr, cr] = await Promise.all([
            api("/api/friends"),
            api("/api/calendars"),
        ]);
        if (fr.ok) setFriends(await fr.json());
        if (cr.ok) setCalendars(await cr.json());
        setLoading(false);
    }, [api]);

    useEffect(() => {
        load();
    }, [load]);

    const sendRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addEmail.trim()) return;
        setAddBusy(true);
        setAddErr("");
        try {
            // Backend accepts userId (which is actually the email — look up by email first)
            const res = await api("/api/friends/request", {
                method: "POST",
                body: JSON.stringify({ email: addEmail.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                setAddErr(data.error ?? "Failed to send request");
                return;
            }
            setShowAdd(false);
            setAddEmail("");
            load();
        } catch {
            setAddErr("Network error");
        } finally {
            setAddBusy(false);
        }
    };

    const accept = async (id: string) => {
        // Optimistic
        setFriends((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: "accepted" } : f)),
        );
        const res = await api(`/api/friends/${id}/accept`, { method: "POST" });
        if (!res.ok) load();
    };

    const decline = async (id: string) => {
        setFriends((prev) => prev.filter((f) => f.id !== id));
        const res = await api(`/api/friends/${id}`, { method: "DELETE" });
        if (!res.ok) load();
    };

    const toggleShare = async (friendship: Friendship, calendarId: string) => {
        const uid = getUid();
        const friendId =
            friendship.user1Id === uid
                ? friendship.user2Id
                : friendship.user1Id;

        const current = friendship.sharedCalendarIds ?? [];
        const isShared = current.includes(calendarId);
        const updated = isShared
            ? current.filter((id) => id !== calendarId)
            : [...current, calendarId];

        const apply = (list: Friendship[]) =>
            list.map((f) =>
                f.id !== friendship.id
                    ? f
                    : { ...f, sharedCalendarIds: updated },
            );
        setFriends(apply);

        await api("/api/friends/share-calendar", {
            method: "POST",
            body: JSON.stringify({ friendId, calendarId, share: !isShared }),
        });
    };

    const uid = getUid();
    const incoming = friends.filter(
        (f) => f.status === "pending" && f.user2Id === uid,
    );
    const outgoing = friends.filter(
        (f) => f.status === "pending" && f.user1Id === uid,
    );
    const accepted = friends.filter((f) => f.status === "accepted");

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
                <span className={s.pageTitle}>Friends</span>
                <button
                    className={`${s.btn} ${s.btnPrimary}`}
                    onClick={() => setShowAdd(true)}
                >
                    <UserPlus size={14} /> Add friend
                </button>
            </div>

            {/* Incoming requests */}
            {incoming.length > 0 && (
                <div className={s.section}>
                    <div className={s.sectionTitle}>Requests</div>
                    <div className={s.list}>
                        {incoming.map((f) => {
                            const other = f.user1;
                            return (
                                <div key={f.id} className={s.row}>
                                    <div className={s.rowInfo}>
                                        <div className={s.rowName}>
                                            {other.name || other.email}
                                        </div>
                                        <div className={s.rowMeta}>
                                            <span className={s.metaText}>
                                                {other.email}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={s.rowActions}>
                                        <button
                                            className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`}
                                            onClick={() => accept(f.id)}
                                        >
                                            <Check size={12} /> Accept
                                        </button>
                                        <button
                                            className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
                                            onClick={() => decline(f.id)}
                                        >
                                            <X size={12} /> Decline
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Accepted friends */}
            <div className={s.section}>
                <div className={s.sectionTitle}>Friends</div>
                {accepted.length === 0 ? (
                    <div className={s.empty}>
                        <span>No friends yet</span>
                    </div>
                ) : (
                    <div className={s.list}>
                        {accepted.map((f) => {
                            const other = f.user1Id === uid ? f.user2 : f.user1;
                            const isOpen = openShare === f.id;
                            const sharedCount =
                                f.sharedCalendarIds?.length ?? 0;
                            return (
                                <div key={f.id} className={s.friendBlock}>
                                    <div className={s.row}>
                                        <div className={s.rowInfo}>
                                            <div className={s.rowName}>
                                                {other.name || other.email}
                                            </div>
                                            <div className={s.rowMeta}>
                                                <span className={s.metaText}>
                                                    {other.email}
                                                </span>
                                                {sharedCount > 0 && (
                                                    <span
                                                        className={`${s.badge} ${s.badgeGreen}`}
                                                    >
                                                        {sharedCount} shared
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={s.rowActions}>
                                            <button
                                                className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                                onClick={() =>
                                                    setOpenShare(
                                                        isOpen ? null : f.id,
                                                    )
                                                }
                                            >
                                                Share{" "}
                                                {isOpen ? (
                                                    <ChevronUp size={12} />
                                                ) : (
                                                    <ChevronDown size={12} />
                                                )}
                                            </button>
                                            <button
                                                className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
                                                onClick={() => decline(f.id)}
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Inline share panel */}
                                    {isOpen && (
                                        <div className={s.sharePanel}>
                                            {calendars.length === 0 ? (
                                                <span className={s.metaText}>
                                                    No calendars to share
                                                </span>
                                            ) : (
                                                calendars.map((cal) => {
                                                    const isShared =
                                                        f.sharedCalendarIds?.includes(
                                                            cal.id,
                                                        ) ?? false;
                                                    return (
                                                        <label
                                                            key={cal.id}
                                                            className={
                                                                s.shareRow
                                                            }
                                                        >
                                                            <div
                                                                className={`${s.checkBox}${isShared ? ` ${s.checkBoxActive}` : ""}`}
                                                                onClick={() =>
                                                                    toggleShare(
                                                                        f,
                                                                        cal.id,
                                                                    )
                                                                }
                                                            >
                                                                {isShared && (
                                                                    <Check
                                                                        size={9}
                                                                        color="#fff"
                                                                    />
                                                                )}
                                                            </div>
                                                            <span
                                                                className={
                                                                    s.shareCalName
                                                                }
                                                            >
                                                                {cal.name}
                                                            </span>
                                                            <span
                                                                className={`${s.badge} ${s.badgeMuted}`}
                                                            >
                                                                {cal.type}
                                                            </span>
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Outgoing pending */}
            {outgoing.length > 0 && (
                <div className={s.section}>
                    <div className={s.sectionTitle}>Sent requests</div>
                    <div className={s.list}>
                        {outgoing.map((f) => (
                            <div key={f.id} className={s.row}>
                                <div className={s.rowInfo}>
                                    <div className={s.rowName}>
                                        {f.user2.name || f.user2.email}
                                    </div>
                                    <div className={s.rowMeta}>
                                        <span className={s.metaText}>
                                            {f.user2.email}
                                        </span>
                                    </div>
                                </div>
                                <div className={s.rowActions}>
                                    <span
                                        className={`${s.badge} ${s.badgeMuted}`}
                                    >
                                        Pending
                                    </span>
                                    <button
                                        className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
                                        onClick={() => decline(f.id)}
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Add friend modal */}
            {showAdd && (
                <div className={s.overlay} onClick={() => setShowAdd(false)}>
                    <div
                        className={s.modal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={s.modalHeader}>
                            <span className={s.modalTitle}>Add friend</span>
                            <button
                                className={s.closeBtn}
                                onClick={() => setShowAdd(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form className={s.formStack} onSubmit={sendRequest}>
                            <div>
                                <label className={s.fieldLabel}>
                                    Email address
                                </label>
                                <input
                                    className={s.input}
                                    type="email"
                                    value={addEmail}
                                    onChange={(e) =>
                                        setAddEmail(e.target.value)
                                    }
                                    placeholder="friend@example.com"
                                    required
                                    autoFocus
                                />
                            </div>
                            {addErr && <div className={s.error}>{addErr}</div>}
                            <div className={s.formRow}>
                                <button
                                    type="button"
                                    className={`${s.btn} ${s.btnSecondary}`}
                                    style={{ flex: 1 }}
                                    onClick={() => setShowAdd(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className={`${s.btn} ${s.btnPrimary}`}
                                    style={{ flex: 1 }}
                                    disabled={addBusy}
                                >
                                    {addBusy ? "Sending…" : "Send request"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
