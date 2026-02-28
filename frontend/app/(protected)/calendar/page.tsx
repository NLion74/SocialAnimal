"use client";

import { useState, useEffect } from "react";
import {
    ChevronLeft,
    ChevronRight,
    Clock,
    MapPin,
    Tag,
    Calendar,
    Check,
} from "lucide-react";
import s from "./page.module.css";
import {
    MONTHS,
    DAYS,
    startOfWeek,
    isSameDay,
    fmtTime,
    fmtDateTime,
    fmtHour,
    getMonthDayHeaders,
    getMonthCells,
} from "../../../lib/date";
import { computeLayouts } from "../../../lib/utils";
import { apiClient } from "../../../lib/api";
import type {
    CalEvent,
    CalSource,
    EventLayout,
    FirstDay,
} from "../../../lib/types";
import Modal from "../../../components/Modal";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const LS_KEYS = {
    view: "calendar:view",
    date: "calendar:date",
    firstDay: "calendar:firstDay",
    hidden: "calendar:hidden",
};

export default function CalendarPage() {
    const [myEvents, setMyEvents] = useState<CalEvent[]>([]);
    const [friendEvents, setFriendEvents] = useState<CalEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [firstDay, setFirstDay] = useState<FirstDay>("monday");
    const [date, setDate] = useState<Date>(() => {
        try {
            const raw = localStorage.getItem(LS_KEYS.date);
            if (raw) return new Date(raw);
        } catch (e) {
            console.error("Failed to parse date from localStorage:", e);
        }
        return new Date();
    });
    const [view, setView] = useState<"month" | "week" | "day">(
        () =>
            (localStorage.getItem(LS_KEYS.view) as "month" | "week" | "day") ||
            "month",
    );
    const [detail, setDetail] = useState<CalEvent | null>(null);
    const [sources, setSources] = useState<CalSource[]>([]);
    const [hidden, setHidden] = useState<Set<string>>(() => {
        try {
            const raw = localStorage.getItem(LS_KEYS.hidden);
            if (raw) return new Set<string>(JSON.parse(raw));
        } catch (e) {
            console.error(
                "Failed to parse hidden sources from localStorage:",
                e,
            );
        }
        return new Set();
    });

    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEYS.firstDay);
            if (raw && (raw === "monday" || raw === "sunday"))
                setFirstDay(raw as FirstDay);
        } catch (e) {
            console.error("Failed to parse first day from localStorage:", e);
        }
    }, []);

    useEffect(() => {
        load();
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(LS_KEYS.view, view);
            localStorage.setItem(LS_KEYS.date, date.toISOString());
            localStorage.setItem(LS_KEYS.firstDay, firstDay);
            localStorage.setItem(
                LS_KEYS.hidden,
                JSON.stringify(Array.from(hidden)),
            );
        } catch (e) {
            console.error("Failed to save calendar state to localStorage:", e);
        }
    }, [view, date, firstDay, hidden]);

    const load = async () => {
        setLoading(true);
        const [mine, friend, cals, me] = await Promise.all([
            apiClient.request<CalEvent[]>("/api/events").catch(() => []),
            apiClient
                .request<CalEvent[]>("/api/events/friends")
                .catch(() => []),
            apiClient.request<any[]>("/api/calendars").catch(() => []),
            apiClient.request<any>("/api/users/me").catch(() => null),
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
                name: `${e.owner.name || e.owner.email} - ${e.calendar.name}`,
                isFriend: true,
            });
        });

        setSources(newSources);
        if (me?.settings?.firstDayOfWeek) {
            const apiFirstDay = me.settings.firstDayOfWeek as FirstDay;
            setFirstDay(apiFirstDay);
            try {
                localStorage.setItem(LS_KEYS.firstDay, apiFirstDay);
            } catch (e) {
                console.error("Failed to save first day to localStorage:", e);
            }
        }
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
            try {
                localStorage.setItem(
                    LS_KEYS.hidden,
                    JSON.stringify(Array.from(n)),
                );
            } catch (e) {
                console.error(
                    "Failed to save hidden sources to localStorage:",
                    e,
                );
            }
            return n;
        });

    const isCalToday = (d: Date | number) => {
        const check =
            typeof d === "number"
                ? new Date(date.getFullYear(), date.getMonth(), d)
                : d;
        return isSameDay(check, new Date());
    };

    const getWeekDays = () => {
        const start = startOfWeek(date, firstDay);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    };

    const eventsForDate = (d: Date) =>
        allEvents.filter((e) => {
            const start = new Date(e.startTime);
            const end = new Date(e.endTime || e.startTime);
            if (e.allDay) return start <= d && d <= end;
            const dayStart = new Date(
                d.getFullYear(),
                d.getMonth(),
                d.getDate(),
                0,
                0,
                0,
                0,
            );
            const dayEnd = new Date(
                d.getFullYear(),
                d.getMonth(),
                d.getDate(),
                23,
                59,
                59,
                999,
            );
            return start <= dayEnd && end >= dayStart;
        });

    const eventsForDay = (day: number) => {
        const y = date.getFullYear();
        const m = date.getMonth();
        return allEvents.filter((e) => {
            const start = new Date(e.startTime);
            const end = new Date(e.endTime);
            const d = new Date(y, m, day);
            return e.allDay
                ? start <= d && d <= end
                : start.getFullYear() === y &&
                      start.getMonth() === m &&
                      start.getDate() === day;
        });
    };

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

    const goToday = () => {
        setDate(new Date());
        setView(view);
    };

    const monthLabel = () => {
        if (view === "month")
            return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
        if (view === "day")
            return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
        const days = getWeekDays();
        return `${MONTHS[days[0].getMonth()]} ${days[0].getDate()} - ${days[6].getDate()}, ${days[6].getFullYear()}`;
    };

    const renderEventPill = (l: EventLayout) => {
        const dur = Math.max(l.event.endMinutes - l.event.startMinutes, 1);
        const percent = 100 / l.cols;
        return (
            <span
                key={l.event.id}
                className={`${s.weekPill} ${l.event.orig.isFriend ? s.pillFriend : s.pillMine} ${s.eventAbsolute}`}
                onClick={(ev) => {
                    ev.stopPropagation();
                    setDetail(l.event.orig);
                }}
                title={l.event.orig.title}
                style={{
                    top: `calc(${l.event.startMinutes} * var(--sa-minute-height))`,
                    height: `calc(${dur} * var(--sa-minute-height))`,
                    left: `${percent * l.col}%`,
                    width: `${percent}%`,
                }}
            >
                <span className={s.weekPillTime}>
                    {fmtTime(l.event.orig.startTime)}
                </span>
                <span className={s.weekPillTitle}>{l.event.orig.title}</span>
            </span>
        );
    };

    const renderTimeGrid = (columns: Date[]) => {
        const now = new Date();
        return (
            <div className={s.weekBodyScroll}>
                <div className={s.weekBodyGrid}>
                    <div className={s.timeGutter}>
                        {HOURS.map((hour) => (
                            <div key={hour} className={s.timeSlot}>
                                <span className={s.timeLabel}>
                                    {fmtHour(hour)}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className={s.weekDayColumns}>
                        {columns.map((day) => {
                            const dayTimed = eventsForDate(day)
                                .filter((e) => !e.allDay)
                                .map((e) => {
                                    const start = new Date(e.startTime);
                                    const end = new Date(
                                        e.endTime || e.startTime,
                                    );
                                    const dayStart = new Date(
                                        day.getFullYear(),
                                        day.getMonth(),
                                        day.getDate(),
                                        0,
                                        0,
                                        0,
                                        0,
                                    );
                                    const dayEnd = new Date(
                                        day.getFullYear(),
                                        day.getMonth(),
                                        day.getDate(),
                                        23,
                                        59,
                                        59,
                                        999,
                                    );
                                    return {
                                        ...e,
                                        startTime:
                                            start < dayStart
                                                ? dayStart.toISOString()
                                                : e.startTime,
                                        endTime:
                                            end > dayEnd
                                                ? dayEnd.toISOString()
                                                : e.endTime,
                                    };
                                });

                            const layouts = computeLayouts(dayTimed);

                            const showNow =
                                isSameDay(day, now) && view !== "month";
                            const topNow =
                                now.getHours() * 60 + now.getMinutes();

                            return (
                                <div
                                    key={day.toISOString()}
                                    className={s.weekDayColumn}
                                >
                                    <div className={s.hourLines}>
                                        {HOURS.map((h) => (
                                            <div
                                                key={h}
                                                className={s.hourLine}
                                            />
                                        ))}
                                    </div>
                                    {showNow && (
                                        <div
                                            className={s.nowMarker}
                                            style={{
                                                top: `calc(${topNow} * var(--sa-minute-height))`,
                                            }}
                                        />
                                    )}
                                    <div className={s.weekEventsContainer}>
                                        {layouts.map(renderEventPill)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    };

    const renderSource = (src: CalSource) => {
        const on = !hidden.has(src.id);
        return (
            <label
                key={src.id}
                className={`${s.calToggle} ${on ? s.calToggleOn : ""}`}
                onClick={() => toggleSource(src.id)}
            >
                <div
                    className={`${s.checkBox} ${on ? (src.isFriend ? s.checkBoxFriend : s.checkBoxMine) : ""}`}
                >
                    {on && <Check size={9} color="#fff" />}
                </div>
                <span className={s.calToggleName}>{src.name}</span>
            </label>
        );
    };

    if (loading)
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
                <span>Loading…</span>
            </div>
        );

    const monthCells = getMonthCells(date, firstDay);
    const monthDayHeaders = getMonthDayHeaders(firstDay);
    const weekDays = getWeekDays();
    const dayEvents = eventsForDate(date);
    const allDayEvents = dayEvents.filter((e) => e.allDay);

    return (
        <div className={s.page}>
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
                                    .map(renderSource)}
                            </>
                        )}
                        {sources.some((src) => src.isFriend) && (
                            <>
                                <div className={s.calDivider} />
                                <div className={s.sidebarTitle}>Friends</div>
                                {sources
                                    .filter((src) => src.isFriend)
                                    .map(renderSource)}
                            </>
                        )}
                    </div>
                )}

                <div className={s.calendarArea}>
                    {view === "month" && (
                        <div className={s.monthGrid}>
                            <div className={s.dayHeaders}>
                                {monthDayHeaders.map((d) => (
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
                                            onClick={() => {
                                                setDate(
                                                    new Date(
                                                        date.getFullYear(),
                                                        date.getMonth(),
                                                        day,
                                                    ),
                                                );
                                                setView("day");
                                            }}
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
                            <div className={s.weekCols}>
                                <div className={s.weekColHeaders}>
                                    <div className={s.weekTimeGutterHeader} />
                                    {weekDays.map((day) => (
                                        <div
                                            key={day.toISOString()}
                                            className={s.weekColHeader}
                                            onClick={() => {
                                                setDate(day);
                                                setView("day");
                                            }}
                                            style={{ cursor: "pointer" }}
                                        >
                                            <div className={s.weekDay}>
                                                {DAYS[day.getDay()]}
                                            </div>
                                            <div
                                                className={`${s.weekDate} ${isCalToday(day) ? s.weekDateToday : ""}`}
                                            >
                                                {day.getDate()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {weekDays.some(
                                    (day) =>
                                        eventsForDate(day).filter(
                                            (e) => e.allDay,
                                        ).length > 0,
                                ) && (
                                    <div className={s.weekAllDayRow}>
                                        <div className={s.weekAllDayLabel}>
                                            All day
                                        </div>
                                        <div className={s.weekAllDayColumns}>
                                            {weekDays.map((day) => {
                                                const dayAllDayEvents =
                                                    eventsForDate(day).filter(
                                                        (e) => e.allDay,
                                                    );
                                                return (
                                                    <div
                                                        key={day.toISOString()}
                                                        className={
                                                            s.weekAllDayCell
                                                        }
                                                        onClick={() => {
                                                            setDate(day);
                                                            setView("day");
                                                        }}
                                                        style={{
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        {dayAllDayEvents.map(
                                                            (e) => (
                                                                <span
                                                                    key={e.id}
                                                                    className={`${s.pill} ${e.isFriend ? s.pillFriend : s.pillMine}`}
                                                                    onClick={(
                                                                        ev,
                                                                    ) => {
                                                                        ev.stopPropagation();
                                                                        setDetail(
                                                                            e,
                                                                        );
                                                                    }}
                                                                    title={
                                                                        e.title
                                                                    }
                                                                >
                                                                    {e.title}
                                                                </span>
                                                            ),
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                {renderTimeGrid(weekDays)}
                            </div>
                        </div>
                    )}

                    {view === "day" && (
                        <div className={s.weekGrid}>
                            <div className={s.weekCols}>
                                <div className={s.weekColHeaders}>
                                    <div className={s.weekTimeGutterHeader} />
                                    <div className={s.weekColHeader}>
                                        <div className={s.weekDay}>
                                            {DAYS[date.getDay()]}
                                        </div>
                                        <div
                                            className={`${s.weekDate} ${isCalToday(date) ? s.weekDateToday : ""}`}
                                        >
                                            {date.getDate()}
                                        </div>
                                    </div>
                                </div>
                                {allDayEvents.length > 0 && (
                                    <div className={s.allDayRow}>
                                        <div className={s.hourLabel}>
                                            All day
                                        </div>
                                        <div className={s.allDayEvents}>
                                            {allDayEvents.map((e) => (
                                                <span
                                                    key={e.id}
                                                    className={`${s.pill} ${e.isFriend ? s.pillFriend : s.pillMine}`}
                                                    onClick={(ev) => {
                                                        ev.stopPropagation();
                                                        setDetail(e);
                                                    }}
                                                >
                                                    {e.title}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {renderTimeGrid([date])}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {detail && (
                <Modal
                    isOpen={true}
                    onClose={() => setDetail(null)}
                    title={detail.title}
                >
                    <div className={s.metaList}>
                        <div className={s.metaRow}>
                            <Clock size={14} className={s.metaIcon} />
                            <div>
                                <div className={s.metaLabel}>Time</div>
                                {detail.allDay
                                    ? "All day"
                                    : `${fmtDateTime(detail.startTime)} - ${fmtTime(detail.endTime)}`}
                            </div>
                        </div>
                        {detail.location && (
                            <div className={s.metaRow}>
                                <MapPin size={14} className={s.metaIcon} />
                                <div>
                                    <div className={s.metaLabel}>Location</div>
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
                </Modal>
            )}
        </div>
    );
}
