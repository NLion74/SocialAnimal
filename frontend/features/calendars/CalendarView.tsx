"use client";

import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import {
	ChevronLeft,
	ChevronRight,
	Clock,
	MapPin,
	Tag,
	Calendar,
	Check,
} from "lucide-react";
import s from "./Calendar.module.css";
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
} from "../../lib/date";
import { computeLayouts } from "../../lib/utils";
import type {
	CalEvent,
	CalSource,
	EventLayout,
	FirstDay,
} from "../../lib/types";
import { dayBounds, calendarToday, zonedParts } from "../../lib/calendar-dates";
import Modal from "../../components/Modal";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function CalendarView({
	events,
	sources = [],
	loading = false,
	date,
	setDate,
	firstDay,
	timezone,
	storageKey,
}: {
	events: CalEvent[];
	sources?: CalSource[];
	loading?: boolean;
	date: Date;
	setDate: Dispatch<SetStateAction<Date>>;
	firstDay: FirstDay;
	timezone: string;
	storageKey?: string;
}) {
	const [view, setView] = useState<"month" | "week" | "day">(() => {
		const saved =
			storageKey && typeof window !== "undefined"
				? localStorage.getItem(`${storageKey}:view`)
				: null;

		return saved === "week" || saved === "day" ? saved : "month";
	});

	const [detail, setDetail] = useState<CalEvent | null>(null);

	const [hidden, setHidden] = useState<Set<string>>(() => {
		try {
			return new Set(
				storageKey && typeof window !== "undefined"
					? JSON.parse(
							localStorage.getItem(`${storageKey}:hidden`) ||
								"[]",
						)
					: [],
			);
		} catch {
			return new Set();
		}
	});

	useEffect(() => {
		setDetail(null);
	}, [events, date, timezone]);

	useEffect(() => {
		if (!storageKey) return;

		try {
			localStorage.setItem(`${storageKey}:view`, view);
			localStorage.setItem(`${storageKey}:date`, date.toISOString());

			localStorage.setItem(
				`${storageKey}:hidden`,
				JSON.stringify([...hidden]),
			);
		} catch {
			/* Browsing remains available when storage is blocked. */
		}
	}, [storageKey, view, date, hidden]);

	const allEvents = events.filter((event) => !hidden.has(event.calendar.id));

	const toggleSource = (id: string) =>
		setHidden((previous) => {
			const next = new Set(previous);

			if (next.has(id)) next.delete(id);
			else next.add(id);

			return next;
		});

	const isCalToday = (d: Date | number) => {
		const check =
			typeof d === "number"
				? new Date(date.getFullYear(), date.getMonth(), d)
				: d;

		return isSameDay(check, calendarToday(timezone));
	};

	const getWeekDays = () => {
		const start = startOfWeek(date, firstDay);

		return Array.from({ length: 7 }, (_, i) => {
			const d = new Date(start);
			d.setDate(start.getDate() + i);
			return d;
		});
	};

	const eventsForDate = (day: Date) => {
		const { start, end } = dayBounds(day, timezone);

		const dateOnly = new Date(
			Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()),
		);

		const nextDate = new Date(+dateOnly + 86400000);

		return allEvents.filter((event) =>
			event.allDay
				? new Date(event.startTime) < nextDate &&
					new Date(event.endTime) > dateOnly
				: new Date(event.startTime) < end &&
					new Date(event.endTime) > start,
		);
	};

	const eventsForDay = (day: number) =>
		eventsForDate(new Date(date.getFullYear(), date.getMonth(), day));

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
		setDate(calendarToday(timezone));
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
					{fmtTime(l.event.orig.startTime, timezone)}
				</span>
				<span className={s.weekPillTitle}>{l.event.orig.title}</span>
			</span>
		);
	};

	const renderTimeGrid = (columns: Date[]) => {
		const getTimeParts = (value: Date) => zonedParts(value, timezone);

		const now = new Date();
		const nowTz = getTimeParts(now);

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
							const dayTz = {
								year: day.getFullYear(),
								month: day.getMonth() + 1,
								day: day.getDate(),
							};

							const dayTimed = eventsForDate(day)
								.filter((e) => !e.allDay)
								.map((e) => {
									const start = new Date(e.startTime);

									const end = new Date(
										e.endTime || e.startTime,
									);

									const { start: dayStart, end: dayEnd } =
										dayBounds(day, timezone);

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

							const layouts = computeLayouts(dayTimed).map(
								(l) => {
									const sParts = getTimeParts(
										new Date(l.event.orig.startTime),
									);

									const eParts = getTimeParts(
										new Date(
											l.event.orig.endTime ||
												l.event.orig.startTime,
										),
									);

									const sameDay = (
										p: ReturnType<typeof getTimeParts>,
									) =>
										p.year === dayTz.year &&
										p.month === dayTz.month &&
										p.day === dayTz.day;

									const startMinutes = sameDay(sParts)
										? sParts.hour * 60 + sParts.minute
										: 0;

									const endMinutes = sameDay(eParts)
										? eParts.hour * 60 + eParts.minute
										: 24 * 60;

									return {
										...l,
										event: {
											...l.event,
											startMinutes,
											endMinutes,
										},
									};
								},
							);

							const showNow =
								view !== "month" &&
								dayTz.year === nowTz.year &&
								dayTz.month === nowTz.month &&
								dayTz.day === nowTz.day;

							const topNow = nowTz.hour * 60 + nowTz.minute;

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
					<button
						className={s.navBtn}
						onClick={prev}
						aria-label="Previous period"
					>
						<ChevronLeft size={15} />
					</button>
					<span className={s.monthLabel}>{monthLabel()}</span>
					<button
						className={s.navBtn}
						onClick={next}
						aria-label="Next period"
					>
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
								aria-pressed={view === v}
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
													className={`${s.pill} ${s.monthEvent} ${e.isFriend ? s.pillFriend : s.pillMine}`}
													title={e.title}
												>
													{!e.allDay && (
														<span
															className={
																s.monthEventTime
															}
														>
															{fmtTime(
																e.startTime,
																timezone,
															)}{" "}
														</span>
													)}
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
									: `${fmtDateTime(detail.startTime, timezone)} - ${fmtTime(detail.endTime, timezone)}`}
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
