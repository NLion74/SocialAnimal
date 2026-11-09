"use client";

import FindTime from "../availability/FindTime";
import CalendarColors from "./CalendarColors";
import Feedback from "../../components/Feedback";

import { useEffect, useState } from "react";
import { accountApi } from "../account/api";
import { calendarsApi } from "./api";
import CalendarView from "./CalendarView";
import s from "./Calendar.module.css";
import type { CalEvent, CalSource, FirstDay } from "../../lib/types";

export default function CalendarPage() {
	const [date, setDate] = useState(() => new Date());
	const [dateRestored, setDateRestored] = useState(false);
	const [events, setEvents] = useState<CalEvent[]>([]);
	const [sources, setSources] = useState<CalSource[]>([]);
	const [firstDay, setFirstDay] = useState<FirstDay>("monday");
	const [timezone, setTimezone] = useState("UTC");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [viewKey, setViewKey] = useState(0);
	const [focusTime, setFocusTime] = useState<string>();

	useEffect(() => {
		try {
			const requested = new URLSearchParams(window.location.search).get(
				"date",
			);
			const saved =
				requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
					? `${requested}T12:00:00`
					: localStorage.getItem("calendar:date");

			if (saved && Number.isFinite(+new Date(saved)))
				setDate(new Date(saved));
		} catch {
			/* Use today when local storage is unavailable. */
		}

		setDateRestored(true);
	}, []);

	useEffect(() => {
		if (!dateRestored) return;
		let active = true;
		setLoading(true);
		setError("");

		Promise.all([
			calendarsApi.events("mine", date),
			calendarsApi.events("shared", date),
			calendarsApi.sources(),
			accountApi.me(),
		])
			.then(([mine, shared, calendars, me]) => {
				if (!active) return;

				setEvents([
					...mine,
					...shared.map((event) => ({ ...event, isFriend: true })),
				]);

				const visibleSources: CalSource[] = calendars.map(
					(calendar) => ({
						id: calendar.id,
						name: calendar.name,
						isFriend: calendar.isFriend,
						color: calendar.color,
						defaultColor: calendar.defaultColor,
					}),
				);

				const seen = new Set<string>(
					visibleSources.map((source) => source.id),
				);

				for (const event of shared) {
					if (!event.owner || seen.has(event.calendar.id)) continue;
					seen.add(event.calendar.id);

					visibleSources.push({
						id: event.calendar.id,
						name: `${event.owner.name || event.owner.email} - ${event.calendar.name}`,
						isFriend: true,
					});
				}

				setSources(visibleSources);
				setFirstDay(me.settings.firstDayOfWeek);
				setTimezone(me.settings.timezone);
			})
			.catch((e) => {
				if (active) {
					setError(e.message);
					setEvents([]);
				}
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [date, dateRestored]);

	// Restore the saved date before CalendarView persists its initial state.
	if (!dateRestored)
		return (
			<div className={s.loading} role="status">
				Loading calendar…
			</div>
		);

	return (
		<>
			<div className={s.calendarActions}>
				<FindTime
					disabled={loading}
					timezone={timezone}
					onSelect={(next, instant) => {
						setFocusTime(instant);
						localStorage.setItem("calendar:view", "day");
						setDate(next);
						setViewKey((value) => value + 1);
					}}
				/>
				<CalendarColors sources={sources} onSaved={setSources} />
			</div>
			{error && (
				<Feedback title="Could not load calendar">{error}</Feedback>
			)}
			<CalendarView
				key={viewKey}
				focusTime={focusTime}
				events={events}
				sources={sources}
				date={date}
				setDate={setDate}
				firstDay={firstDay}
				timezone={timezone}
				loading={loading}
				storageKey="calendar"
			/>
		</>
	);
}
