"use client";

import Feedback from "../../components/Feedback";

import { useEffect, useState } from "react";
import { accountApi } from "../account/api";
import { calendarsApi } from "./api";
import CalendarView from "./CalendarView";
import type { CalEvent, CalSource, FirstDay } from "../../lib/types";

export default function CalendarPage() {
	const [date, setDate] = useState(() => new Date());
	const [events, setEvents] = useState<CalEvent[]>([]);
	const [sources, setSources] = useState<CalSource[]>([]);
	const [firstDay, setFirstDay] = useState<FirstDay>("monday");
	const [timezone, setTimezone] = useState("UTC");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		try {
			const saved = localStorage.getItem("calendar:date");

			if (saved && Number.isFinite(+new Date(saved)))
				setDate(new Date(saved));
		} catch {
			/* Use today when local storage is unavailable. */
		}
	}, []);

	useEffect(() => {
		let active = true;
		setLoading(true);
		setError("");

		Promise.all([
			calendarsApi.events("mine", date),
			calendarsApi.events("shared", date),
			calendarsApi.list(),
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
						isFriend: false,
					}),
				);

				const seen = new Set<string>();

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
	}, [date]);

	return (
		<>
			{error && (
				<Feedback title="Could not load calendar">{error}</Feedback>
			)}
			<CalendarView
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
