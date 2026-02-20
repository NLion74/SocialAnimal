"use client";
import { useState, useEffect, useCallback } from "react";
import { UserPlus, X, Check, Users, Share2 } from "lucide-react";
import s from "./FriendsTab.module.css";
import { apiClient } from "../lib/api";
import type { Friend, CalendarData, Permission } from "../lib/types";

const PERM_LABELS: Record<Permission, string> = {
    busy: "🔴 Busy only",
    titles: "🟡 Titles only",
    full: "🟢 Full details",
};

export default function FriendsTab() {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [calendars, setCalendars] = useState<CalendarData[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [email, setEmail] = useState("");
    const [addErr, setAddErr] = useState("");
    const [adding, setAdding] = useState(false);

    const [shareTarget, setShareTarget] = useState<Friend | null>(null);

    const uid = apiClient.getUid();

    const load = useCallback(async () => {
        setLoading(true);
        const [fr, cr] = await Promise.all([
            apiClient.request<Friend[]>("/api/friends").catch(() => []),
            apiClient.request<CalendarData[]>("/api/calendars").catch(() => []),
        ]);
        setFriends(fr);
        setCalendars(cr);
        setLoading(false);
        setShareTarget((prev) =>
            prev ? fr.find((f) => f.id === prev.id) ?? null : null
        );
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const getFriend = (f: Friend) => (f.user1.id === uid ? f.user2 : f.user1);
    const isIncoming = (f: Friend) =>
        f.status === "pending" && f.user2.id === uid;

    const sendRequest = async () => {
        if (!email) return;
        setAdding(true);
        setAddErr("");
        try {
            await apiClient.post("/api/friends/request", { email });
            setShowAdd(false);
            setEmail("");
            load();
        } catch (e: any) {
            setAddErr(e.message);
        } finally {
            setAdding(false);
        }
    };

    const accept = async (id: string) => {
        await apiClient.post(`/api/friends/${id}/accept`).catch(() => {});
        load();
    };

    const remove = async (id: string) => {
        if (!confirm("Remove this friend?")) return;
        await apiClient.del(`/api/friends/${id}`).catch(() => {});
        load();
    };

    const toggleShare = async (
        friendId: string,
        calendarId: string,
        share: boolean,
        permission: Permission
    ) => {
        setShareTarget((prev) => {
            if (!prev) return prev;
            const ids = share
                ? [...new Set([...(prev.sharedCalendarIds ?? []), calendarId])]
                : (prev.sharedCalendarIds ?? []).filter(
                      (id) => id !== calendarId
                  );
            const perms = { ...prev.sharedCalendarPermissions };
            if (share) perms[calendarId] = permission;
            else delete perms[calendarId];
            return {
                ...prev,
                sharedCalendarIds: ids,
                sharedCalendarPermissions: perms,
            };
        });

        await apiClient
            .post("/api/friends/share-calendar", {
                friendId,
                calendarId,
                share,
                permission,
            })
            .catch(() => {});
        load();
    };

    if (loading)
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
                <span>Loading…</span>
            </div>
        );

    const accepted = friends.filter((f) => f.status === "accepted");
    const pending = friends.filter((f) => f.status === "pending");

    return (
        <div className={s.page}>
            <div className={s.pageHeader}>
                <h1 className={s.pageTitle}>Friends</h1>
                <button
                    className={`${s.btn} ${s.btnPrimary}`}
                    onClick={() => setShowAdd(true)}
                >
                    <UserPlus size={14} /> Add Friend
                </button>
            </div>

            <div className={s.section}>
                <div className={s.sectionTitle}>
                    Friends ({accepted.length})
                </div>
                {accepted.length === 0 ? (
                    <div className={s.empty}>
                        <Users size={36} className={s.emptyIcon} />
                        <span>No friends yet</span>
                    </div>
                ) : (
                    <div className={s.list}>
                        {accepted.map((f) => {
                            const friend = getFriend(f);
                            return (
                                <div key={f.id} className={s.row}>
                                    <div className={s.rowInfo}>
                                        <div className={s.rowName}>
                                            {friend.name || friend.email}
                                        </div>
                                        <div className={s.rowEmail}>
                                            {friend.email}
                                        </div>
                                        {(f.sharedCalendarIds ?? []).length >
                                            0 && (
                                            <div className={s.rowMeta}>
                                                <span
                                                    className={`${s.badge} ${s.badgeGreen}`}
                                                >
                                                    {
                                                        (
                                                            f.sharedCalendarIds ??
                                                            []
                                                        ).length
                                                    }{" "}
                                                    shared
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                    <div className={s.rowActions}>
                                        <button
                                            className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
                                            onClick={() => setShareTarget(f)}
                                        >
                                            <Share2 size={12} /> Share
                                        </button>
                                        <button
                                            className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
                                            onClick={() => remove(f.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {pending.length > 0 && (
                <div className={s.section}>
                    <div className={s.sectionTitle}>Pending Requests</div>
                    <div className={s.list}>
                        {pending.map((f) => {
                            const friend = getFriend(f);
                            return (
                                <div key={f.id} className={s.row}>
                                    <div className={s.rowInfo}>
                                        <div className={s.rowName}>
                                            {friend.name || friend.email}
                                        </div>
                                        <div className={s.rowEmail}>
                                            {friend.email}
                                        </div>
                                    </div>
                                    <div className={s.rowActions}>
                                        {isIncoming(f) ? (
                                            <>
                                                <button
                                                    className={`${s.btn} ${s.btnSuccess} ${s.btnSm}`}
                                                    onClick={() => accept(f.id)}
                                                >
                                                    <Check size={12} /> Accept
                                                </button>
                                                <button
                                                    className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
                                                    onClick={() => remove(f.id)}
                                                >
                                                    <X size={12} /> Decline
                                                </button>
                                            </>
                                        ) : (
                                            <span
                                                className={`${s.badge} ${s.badgeMuted}`}
                                            >
                                                Sent
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {showAdd && (
                <div className={s.overlay} onClick={() => setShowAdd(false)}>
                    <div
                        className={s.modal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={s.modalHeader}>
                            <span className={s.modalTitle}>Add Friend</span>
                            <button
                                className={s.closeBtn}
                                onClick={() => setShowAdd(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className={s.formStack}>
                            <div>
                                <label className={s.fieldLabel}>
                                    Friend's Email
                                </label>
                                <input
                                    className={s.input}
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="friend@example.com"
                                    onKeyDown={(e) =>
                                        e.key === "Enter" && sendRequest()
                                    }
                                />
                            </div>
                            {addErr && <div className={s.error}>{addErr}</div>}
                            <div className={s.formRow}>
                                <button
                                    className={`${s.btn} ${s.btnPrimary}`}
                                    style={{ flex: 1 }}
                                    onClick={sendRequest}
                                    disabled={adding || !email}
                                >
                                    {adding ? "Sending…" : "Send Request"}
                                </button>
                                <button
                                    className={`${s.btn} ${s.btnSecondary}`}
                                    onClick={() => {
                                        setShowAdd(false);
                                        setEmail("");
                                        setAddErr("");
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {shareTarget &&
                (() => {
                    const friend = getFriend(shareTarget);
                    return (
                        <div
                            className={s.overlay}
                            onClick={() => setShareTarget(null)}
                        >
                            <div
                                className={s.modal}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className={s.modalHeader}>
                                    <span className={s.modalTitle}>
                                        Share with {friend.name || friend.email}
                                    </span>
                                    <button
                                        className={s.closeBtn}
                                        onClick={() => setShareTarget(null)}
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
                                <p className={s.modalSub}>
                                    Choose which calendars to share and what
                                    level of detail.
                                </p>
                                <div className={s.shareList}>
                                    {calendars.length === 0 && (
                                        <div className={s.empty}>
                                            No calendars to share
                                        </div>
                                    )}
                                    {calendars.map((cal) => {
                                        const shared = (
                                            shareTarget.sharedCalendarIds ?? []
                                        ).includes(cal.id);
                                        const perm: Permission =
                                            shareTarget
                                                .sharedCalendarPermissions?.[
                                                cal.id
                                            ] ?? "full";
                                        return (
                                            <div
                                                key={cal.id}
                                                className={s.shareRow}
                                            >
                                                <div className={s.shareRowName}>
                                                    {cal.name}
                                                </div>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: "0.5rem",
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    {shared && (
                                                        <select
                                                            className={
                                                                s.permSelect
                                                            }
                                                            value={perm}
                                                            onChange={(e) =>
                                                                toggleShare(
                                                                    friend.id,
                                                                    cal.id,
                                                                    true,
                                                                    e.target
                                                                        .value as Permission
                                                                )
                                                            }
                                                            onClick={(e) =>
                                                                e.stopPropagation()
                                                            }
                                                        >
                                                            {(
                                                                Object.keys(
                                                                    PERM_LABELS
                                                                ) as Permission[]
                                                            ).map((p) => (
                                                                <option
                                                                    key={p}
                                                                    value={p}
                                                                >
                                                                    {
                                                                        PERM_LABELS[
                                                                            p
                                                                        ]
                                                                    }
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    <button
                                                        className={`${s.btn} ${
                                                            shared
                                                                ? s.btnDanger
                                                                : s.btnSuccess
                                                        } ${s.btnSm}`}
                                                        onClick={() =>
                                                            toggleShare(
                                                                friend.id,
                                                                cal.id,
                                                                !shared,
                                                                perm
                                                            )
                                                        }
                                                    >
                                                        {shared
                                                            ? "Unshare"
                                                            : "Share"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })()}
        </div>
    );
}
