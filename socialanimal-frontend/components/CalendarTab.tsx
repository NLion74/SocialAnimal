"use client";
import { useState, useEffect } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    MapPin,
    X,
    Tag,
    Calendar,
    Check,
} from "lucide-react";
import s from "./CalendarTab.module.css";

interface CalEvent {
    id: string;
    title: string;
    description?: string;
    location?: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    isFriend?: boolean;
    owner?: { id: string; name?: string; email: string } | null;
    calendar: { id: string; name: string; type: string };
}
interface CalSource {
    id: string;
    name: string;
    isFriend: boolean;
}

const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function startOfWeek(d: Date) {
    const n = new Date(d);
    n.setDate(d.getDate() - d.getDay());
    return n;
}

export default function CalendarTab() {
    const [myEvents, setMyEvents] = useState<CalEvent[]>([]);
    const [friendEvents, setFriendEvents] = useState<CalEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState(new Date());
    const [view, setView] = useState<"month" | "week" | "today">("month");
    const [detail, setDetail] = useState<CalEvent | null>(null);
    const [sources, setSources] = useState<CalSource[]>([]);
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    useEffect(() => {
        load();
    }, []);

    const api = (path: string) =>
        fetch(path, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
        });

    const load = async () => {
        setLoading(true);
        const [er, fer, cr] = await Promise.all([
            api("/api/events"),
            api("/api/events/friends"),
            api("/api/calendars"),
        ]);

        const mine: CalEvent[] = er.ok ? await er.json() : [];
        const friend: CalEvent[] = fer.ok ? await fer.json() : [];

        setMyEvents(mine);
        setFriendEvents(friend.map((e) => ({ ...e, isFriend: true })));

        const newSources: CalSource[] = [];
        if (cr.ok) {
            const cals = await cr.json();
            cals.forEach((c: any) =>
                newSources.push({ id: c.id, name: c.name, isFriend: false }),
            );
        }

        const seenCalIds = new Set<string>();
        friend.forEach((e) => {
            if (!e.owner) return;
            if (seenCalIds.has(e.calendar.id)) return;
            seenCalIds.add(e.calendar.id);
            if (!newSources.find((src) => src.id === e.calendar.id)) {
                newSources.push({
                    id: e.calendar.id,
                    name: `${e.owner.name || e.owner.email} – ${e.calendar.name}`,
                    isFriend: true,
                });
            }
        });

        setSources(newSources);
        setLoading(false);
    };

    const allEvents = [
        ...myEvents.filter((e) => !hidden.has(e.calendar.id)),
        ...friendEvents.filter((e) => !hidden.has(e.calendar.id)),
    ];

    const toggleSource = (id: string) =>
        setHidden((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });

    // Navigation
    const prev = () => {
        if (view === "month")
            setDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
        else if (view === "week")
            setDate((d) => {
                const n = new Date(d);
                n.setDate(d.getDate() - 7);
                return n;
            });
    };
    const next = () => {
        if (view === "month")
            setDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
        else if (view === "week")
            setDate((d) => {
                const n = new Date(d);
                n.setDate(d.getDate() + 7);
                return n;
            });
    };
    const goToday = () => setDate(new Date());

    // Month
    const getMonthCells = () => {
        const y = date.getFullYear(),
            m = date.getMonth();
        const cells: (number | null)[] = [];
        for (let i = 0; i < new Date(y, m, 1).getDay(); i++) cells.push(null);
        for (let i = 1; i <= new Date(y, m + 1, 0).getDate(); i++)
            cells.push(i);
        return cells;
    };

    const eventsForDay = (day: number) => {
        const y = date.getFullYear(),
            m = date.getMonth();
        return allEvents.filter((e) => {
            const d = new Date(e.startTime);
            return (
                d.getFullYear() === y &&
                d.getMonth() === m &&
                d.getDate() === day
            );
        });
    };

    const isCalToday = (d: Date | number) => {
        const n = new Date();
        const check =
            typeof d === "number"
                ? new Date(date.getFullYear(), date.getMonth(), d)
                : d;
        return check.toDateString() === n.toDateString();
    };

    // Week
    const getWeekDays = () => {
        const start = startOfWeek(date);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    };

    const eventsForDate = (d: Date) =>
        allEvents.filter(
            (e) => new Date(e.startTime).toDateString() === d.toDateString(),
        );

    // Today
    const todayEvents = allEvents
        .filter(
            (e) =>
                new Date(e.startTime).toDateString() ===
                new Date().toDateString(),
        )
        .sort((a, b) => {
            if (a.allDay && !b.allDay) return -1;
            if (!a.allDay && b.allDay) return 1;
            return (
                new Date(a.startTime).getTime() -
                new Date(b.startTime).getTime()
            );
        });

    const fmt = (iso: string) =>
        new Date(iso).toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
        });
    const fmtTime = (iso: string) =>
        new Date(iso).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });

    const monthLabel = () => {
        if (view === "month")
            return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
        if (view === "today") {
            const n = new Date();
            return `${DAYS[n.getDay()]}, ${MONTHS[n.getMonth()]} ${n.getDate()}`;
        }
        const days = getWeekDays();
        return `${MONTHS[days[0].getMonth()]} ${days[0].getDate()} – ${days[6].getDate()}, ${days[6].getFullYear()}`;
    };

    if (loading)
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
                <span>Loading…</span>
            </div>
        );

    const monthCells = getMonthCells();
    const weekDays = getWeekDays();

    return (
        <div className={s.page}>
            {/* Toolbar */}
            <div className={s.toolbar}>
                <div className={s.navGroup}>
                    {view !== "today" && (
                        <button className={s.navBtn} onClick={prev}>
                            <ChevronLeft size={15} />
                        </button>
                    )}
                    <span className={s.monthLabel}>{monthLabel()}</span>
                    {view !== "today" && (
                        <button className={s.navBtn} onClick={next}>
                            <ChevronRight size={15} />
                        </button>
                    )}
                </div>
                <div className={s.rightGroup}>
                    <button className={s.todayBtn} onClick={goToday}>
                        Today
                    </button>
                    <div className={s.viewGroup}>
                        {(["month", "week", "today"] as const).map((v) => (
                            <button
                                key={v}
                                className={`${s.viewBtn}${view === v ? ` ${s.viewBtnActive}` : ""}`}
                                onClick={() => setView(v)}
                                style={{ textTransform: "capitalize" }}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Layout */}
            <div className={s.layout}>
                {/* Sidebar */}
                {sources.length > 0 && (
                    <div className={s.sidebar}>
                        {sources.some((s) => !s.isFriend) && (
                            <>
                                <div className={s.sidebarTitle}>
                                    My Calendars
                                </div>
                                {sources
                                    .filter((src) => !src.isFriend)
                                    .map((src) => {
                                        const on = !hidden.has(src.id);
                                        return (
                                            <label
                                                key={src.id}
                                                className={`${s.calToggle}${on ? ` ${s.calToggleOn}` : ""}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={on}
                                                    onChange={() =>
                                                        toggleSource(src.id)
                                                    }
                                                />
                                                <div
                                                    className={`${s.checkBox}${on ? ` ${s.checkBoxMine}` : ""}`}
                                                >
                                                    {on && (
                                                        <Check
                                                            size={8}
                                                            color="#fff"
                                                        />
                                                    )}
                                                </div>
                                                <span
                                                    className={s.calToggleName}
                                                    title={src.name}
                                                >
                                                    {src.name}
                                                </span>
                                            </label>
                                        );
                                    })}
                            </>
                        )}

                        {sources.some((s) => s.isFriend) && (
                            <>
                                <div className={s.calDivider} />
                                <div className={s.sidebarTitle}>Friends</div>
                                {sources
                                    .filter((src) => src.isFriend)
                                    .map((src) => {
                                        const on = !hidden.has(src.id);
                                        return (
                                            <label
                                                key={src.id}
                                                className={`${s.calToggle}${on ? ` ${s.calToggleOn}` : ""}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={on}
                                                    onChange={() =>
                                                        toggleSource(src.id)
                                                    }
                                                />
                                                <div
                                                    className={`${s.checkBox}${on ? ` ${s.checkBoxFriend}` : ""}`}
                                                >
                                                    {on && (
                                                        <Check
                                                            size={8}
                                                            color="#fff"
                                                        />
                                                    )}
                                                </div>
                                                <span
                                                    className={s.calToggleName}
                                                    title={src.name}
                                                >
                                                    {src.name}
                                                </span>
                                            </label>
                                        );
                                    })}
                            </>
                        )}
                    </div>
                )}

                <div className={s.calendarArea}>
                    {/* Month view */}
                    {view === "month" && (
                        <div className={s.monthGrid}>
                            <div className={s.dayHeaders}>
                                {DAYS.map((d) => (
                                    <div key={d} className={s.dayHeader}>
                                        {d}
                                    </div>
                                ))}
                            </div>
                            <div className={s.monthCells}>
                                {monthCells.map((day, i) => {
                                    if (day === null)
                                        return (
                                            <div
                                                key={`e-${i}`}
                                                className={`${s.cell} ${s.cellEmpty}`}
                                            />
                                        );
                                    const dayEvs = eventsForDay(day);
                                    const visible = dayEvs.slice(0, 2);
                                    const overflow = dayEvs.length - 2;
                                    return (
                                        <div
                                            key={day}
                                            className={`${s.cell}${isCalToday(day) ? ` ${s.cellToday}` : ""}`}
                                        >
                                            <div className={s.dayNum}>
                                                {day}
                                            </div>
                                            {visible.map((e) => (
                                                <div
                                                    key={e.id}
                                                    className={`${s.pill} ${e.isFriend ? s.pillFriend : s.pillMine}`}
                                                    onClick={() => setDetail(e)}
                                                    title={e.title}
                                                >
                                                    {e.allDay
                                                        ? ""
                                                        : `${fmtTime(e.startTime)} `}
                                                    {e.title}
                                                </div>
                                            ))}
                                            {overflow > 0 && (
                                                <div className={s.overflow}>
                                                    +{overflow}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Week view */}
                    {view === "week" && (
                        <div className={s.weekGrid}>
                            {weekDays.map((day) => {
                                const dayEvs = eventsForDate(day);
                                const today = isCalToday(day);
                                return (
                                    <div
                                        key={day.toISOString()}
                                        className={s.weekCol}
                                    >
                                        <div className={s.weekColHeader}>
                                            <div className={s.weekDay}>
                                                {DAYS[day.getDay()]}
                                            </div>
                                            <div
                                                className={`${s.weekDate}${today ? ` ${s.weekDateToday}` : ""}`}
                                            >
                                                {day.getDate()}
                                            </div>
                                        </div>
                                        <div className={s.weekColBody}>
                                            {dayEvs.map((e) => (
                                                <div
                                                    key={e.id}
                                                    className={`${s.pill} ${e.isFriend ? s.pillFriend : s.pillMine}`}
                                                    onClick={() => setDetail(e)}
                                                    title={e.title}
                                                >
                                                    {e.allDay
                                                        ? "All day"
                                                        : fmtTime(
                                                              e.startTime,
                                                          )}{" "}
                                                    · {e.title}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Today view */}
                    {view === "today" && (
                        <div className={s.todayView}>
                            <div className={s.todayHeader}>
                                {todayEvents.length} event
                                {todayEvents.length !== 1 ? "s" : ""} today
                            </div>
                            {todayEvents.length === 0 ? (
                                <div className={s.todayEmpty}>
                                    <Calendar
                                        size={36}
                                        className={s.todayEmptyIcon}
                                    />
                                    <span>Nothing scheduled today</span>
                                </div>
                            ) : (
                                todayEvents.map((e) => (
                                    <div
                                        key={e.id}
                                        className={s.todayEvent}
                                        onClick={() => setDetail(e)}
                                    >
                                        <div
                                            className={`${s.todayStrip} ${e.isFriend ? s.todayStripFriend : s.todayStripMine}`}
                                        />
                                        <div className={s.todayTime}>
                                            {e.allDay
                                                ? "All day"
                                                : fmtTime(e.startTime)}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className={s.todayTitle}>
                                                {e.title}
                                            </div>
                                            <div className={s.todayCal}>
                                                {e.isFriend
                                                    ? `${e.owner?.name || e.owner?.email} · ${e.calendar.name}`
                                                    : e.calendar.name}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Event detail modal */}
            {detail && (
                <div className={s.overlay} onClick={() => setDetail(null)}>
                    <div
                        className={s.modal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={s.modalHeader}>
                            <span className={s.modalTitle}>{detail.title}</span>
                            <button
                                className={s.closeBtn}
                                onClick={() => setDetail(null)}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className={s.metaList}>
                            <div className={s.metaRow}>
                                <Clock size={14} className={s.metaIcon} />
                                <div>
                                    <div className={s.metaLabel}>Time</div>
                                    {detail.allDay
                                        ? "All day"
                                        : `${fmt(detail.startTime)} – ${fmtTime(detail.endTime)}`}
                                </div>
                            </div>
                            {detail.location && (
                                <div className={s.metaRow}>
                                    <MapPin size={14} className={s.metaIcon} />
                                    <div>
                                        <div className={s.metaLabel}>
                                            Location
                                        </div>
                                        {detail.location}
                                    </div>
                                </div>
                            )}
                            {detail.description && (
                                <div className={s.metaRow}>
                                    <Tag size={14} className={s.metaIcon} />
                                    <div>
                                        <div className={s.metaLabel}>Notes</div>
                                        {detail.description}
                                    </div>
                                </div>
                            )}
                            <div className={s.metaRow}>
                                <Calendar size={14} className={s.metaIcon} />
                                <div>
                                    <div className={s.metaLabel}>Calendar</div>
                                    <span
                                        className={
                                            detail.isFriend
                                                ? s.calBadgeFriend
                                                : s.calBadgeMine
                                        }
                                    >
                                        {detail.isFriend
                                            ? `${detail.owner?.name || detail.owner?.email} · ${detail.calendar.name}`
                                            : detail.calendar.name}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
