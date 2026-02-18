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
import {
    MONTHS,
    DAYS,
    startOfWeek,
    isSameDay,
    fmtTime,
    fmtDateTime,
} from "@/lib/date";
import { apiFetch } from "@/lib/api";

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

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarTab() {
    const [myEvents, setMyEvents] = useState<CalEvent[]>([]);
    const [friendEvents, setFriendEvents] = useState<CalEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState(new Date());
    const [view, setView] = useState<"month" | "week" | "day">("month");
    const [detail, setDetail] = useState<CalEvent | null>(null);
    const [sources, setSources] = useState<CalSource[]>([]);
    const [hidden, setHidden] = useState<Set<string>>(new Set());

    useEffect(() => {
        load();
    }, []);

    const load = async () => {
        setLoading(true);
        const [mine, friend, cals] = await Promise.all([
            apiFetch<CalEvent[]>("/api/events").catch(() => []),
            apiFetch<CalEvent[]>("/api/events/friends").catch(() => []),
            apiFetch<any[]>("/api/calendars").catch(() => []),
        ]);
        setMyEvents(mine);
        setFriendEvents(friend.map((e) => ({ ...e, isFriend: true })));

        const newSources: CalSource[] = cals.map((c) => ({
            id: c.id,
            name: c.name,
            isFriend: false,
        }));
        const seen = new Set<string>();
        friend.forEach((e) => {
            if (!e.owner || seen.has(e.calendar.id)) return;
            seen.add(e.calendar.id);
            newSources.push({
                id: e.calendar.id,
                name: `${e.owner.name || e.owner.email} – ${e.calendar.name}`,
                isFriend: true,
            });
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

    const prev = () => {
        if (view === "month")
            setDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
        else if (view === "week")
            setDate((d) => {
                const n = new Date(d);
                n.setDate(d.getDate() - 7);
                return n;
            });
        else
            setDate((d) => {
                const n = new Date(d);
                n.setDate(d.getDate() - 1);
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
        else
            setDate((d) => {
                const n = new Date(d);
                n.setDate(d.getDate() + 1);
                return n;
            });
    };
    const goToday = () => setDate(new Date());

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
        const check =
            typeof d === "number"
                ? new Date(date.getFullYear(), date.getMonth(), d)
                : d;
        return isSameDay(check, new Date());
    };

    const getWeekDays = () => {
        const start = startOfWeek(date);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    };

    const eventsForDate = (d: Date) =>
        allEvents.filter((e) => isSameDay(new Date(e.startTime), d));

    const eventsForHour = (evs: CalEvent[], hour: number) =>
        evs.filter(
            (e) => !e.allDay && new Date(e.startTime).getHours() === hour,
        );

    const monthLabel = () => {
        if (view === "month")
            return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
        if (view === "day")
            return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
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
    const dayEvents = eventsForDate(date);

    return (
        <div className={s.page}>
            {/* Toolbar */}
            <div className={s.toolbar}>
                <div className={s.navGroup}>
                    <button className={s.navBtn} onClick={prev}>
                        <ChevronLeft size={15} />
                    </button>
                    <span className={s.monthLabel}>{monthLabel()}</span>
                    <button className={s.navBtn} onClick={next}>
                        <ChevronRight size={15} />
                    </button>
                </div>
                <div className={s.rightGroup}>
                    <button className={s.todayBtn} onClick={goToday}>
                        Today
                    </button>
                    <div className={s.viewGroup}>
                        {(["month", "week", "day"] as const).map((v) => (
                            <button
                                key={v}
                                className={`${s.viewBtn} ${view === v ? s.viewBtnActive : ""}`}
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
                {sources.length > 0 && (
                    <div className={s.sidebar}>
                        {sources.some((src) => !src.isFriend) && (
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
                                                className={`${s.calToggle} ${on ? s.calToggleOn : ""}`}
                                                onClick={() =>
                                                    toggleSource(src.id)
                                                }
                                            >
                                                <div
                                                    className={`${s.checkBox} ${on ? s.checkBoxMine : ""}`}
                                                >
                                                    {on && (
                                                        <Check
                                                            size={9}
                                                            color="#fff"
                                                        />
                                                    )}
                                                </div>
                                                <span
                                                    className={s.calToggleName}
                                                >
                                                    {src.name}
                                                </span>
                                            </label>
                                        );
                                    })}
                            </>
                        )}
                        {sources.some((src) => src.isFriend) && (
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
                                                className={`${s.calToggle} ${on ? s.calToggleOn : ""}`}
                                                onClick={() =>
                                                    toggleSource(src.id)
                                                }
                                            >
                                                <div
                                                    className={`${s.checkBox} ${on ? s.checkBoxFriend : ""}`}
                                                >
                                                    {on && (
                                                        <Check
                                                            size={9}
                                                            color="#fff"
                                                        />
                                                    )}
                                                </div>
                                                <span
                                                    className={s.calToggleName}
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
                    {/* Month */}
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
                                            className={`${s.cell} ${isCalToday(day) ? s.cellToday : ""}`}
                                        >
                                            <span className={s.dayNum}>
                                                {day}
                                            </span>
                                            {visible.map((e) => (
                                                <span
                                                    key={e.id}
                                                    className={`${s.pill} ${e.isFriend ? s.pillFriend : s.pillMine}`}
                                                    onClick={() => setDetail(e)}
                                                    title={e.title}
                                                >
                                                    {e.allDay
                                                        ? ""
                                                        : `${fmtTime(e.startTime)} `}
                                                    {e.title}
                                                </span>
                                            ))}
                                            {overflow > 0 && (
                                                <span className={s.overflow}>
                                                    +{overflow}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
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
                                                className={`${s.weekDate} ${today ? s.weekDateToday : ""}`}
                                            >
                                                {day.getDate()}
                                            </div>
                                        </div>
                                        <div className={s.weekColBody}>
                                            {dayEvs.map((e) => (
                                                <span
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
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Day — hourly grid */}
                    {view === "day" && (
                        <div className={s.dayGrid}>
                            {/* All-day strip */}
                            {dayEvents.filter((e) => e.allDay).length > 0 && (
                                <div className={s.allDayRow}>
                                    <div className={s.hourLabel}>All day</div>
                                    <div className={s.allDayEvents}>
                                        {dayEvents
                                            .filter((e) => e.allDay)
                                            .map((e) => (
                                                <span
                                                    key={e.id}
                                                    className={`${s.pill} ${e.isFriend ? s.pillFriend : s.pillMine}`}
                                                    onClick={() => setDetail(e)}
                                                >
                                                    {e.title}
                                                </span>
                                            ))}
                                    </div>
                                </div>
                            )}
                            {HOURS.map((hour) => {
                                const hourEvs = eventsForHour(dayEvents, hour);
                                return (
                                    <div key={hour} className={s.hourRow}>
                                        <div className={s.hourLabel}>
                                            {hour === 0
                                                ? "12 AM"
                                                : hour < 12
                                                  ? `${hour} AM`
                                                  : hour === 12
                                                    ? "12 PM"
                                                    : `${hour - 12} PM`}
                                        </div>
                                        <div className={s.hourSlot}>
                                            {hourEvs.map((e) => (
                                                <span
                                                    key={e.id}
                                                    className={`${s.dayEvent} ${e.isFriend ? s.dayEventFriend : s.dayEventMine}`}
                                                    onClick={() => setDetail(e)}
                                                >
                                                    <span
                                                        className={
                                                            s.dayEventTime
                                                        }
                                                    >
                                                        {fmtTime(e.startTime)} –{" "}
                                                        {fmtTime(e.endTime)}
                                                    </span>
                                                    <span
                                                        className={
                                                            s.dayEventTitle
                                                        }
                                                    >
                                                        {e.title}
                                                    </span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
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
                                        : `${fmtDateTime(detail.startTime)} – ${fmtTime(detail.endTime)}`}
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
