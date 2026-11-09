"use client";

import { Clock, ChevronRight } from "lucide-react";
import Feedback from "../../components/Feedback";
import { availabilityApi } from "./api";
import s from "./FindTime.module.css";

export default function SearchResults({
	result,
	timezone,
	userId,
	friends,
	includeAllDay,
	ownCalendars,
	summary,
	onSelect,
}: {
	result: Awaited<ReturnType<typeof availabilityApi.search>>;
	timezone: string;
	userId?: string;
	friends: Array<{ id: string; name: string }>;
	includeAllDay: boolean;
	ownCalendars: number;
	summary: string;
	onSelect: (date: Date, instant: string) => void;
}) {
	const time = new Intl.DateTimeFormat(undefined, {
		timeZone: timezone,
		hour: "numeric",
		minute: "2-digit",
	});
	const day = new Intl.DateTimeFormat(undefined, {
		timeZone: timezone,
		weekday: "long",
		month: "short",
		day: "numeric",
	});

	return (
		<section
			className={s.results}
			aria-label="Search results"
			aria-live="polite"
		>
			<p className={s.help}>
				{summary}. Times in {timezone}.
			</p>
			{!ownCalendars && (
				<p className={s.selectionNote}>
					Your own availability is not included. These times only
					reflect your friends’ shared calendars.
				</p>
			)}
			{result.notices.map((notice) => (
				<Feedback
					key={notice.userId}
					title={
						notice.userId === userId
							? "Your calendars"
							: friends.find(
									(friend) => friend.id === notice.userId,
								)?.name || "Shared calendars"
					}
				>
					{notice.message}
				</Feedback>
			))}
			{!result.notices.length && !result.items.length && (
				<div className={s.empty}>
					<Clock size={28} aria-hidden="true" />
					<p>
						No shared free time in this range. Try shorter meetings
						or different hours.
					</p>
					{includeAllDay && result.allDayEvents > 0 && (
						<p>
							All-day events are blocking time. Edit your search
							to exclude them if they are only reminders.
						</p>
					)}
				</div>
			)}
			{!includeAllDay && result.allDayEvents > 0 && (
				<p className={s.help}>
					All-day events are excluded from these suggestions.
				</p>
			)}
			{!!result.items.length && (
				<p className={s.help}>
					Choose a time to view that day. Confirm with your friends
					before making plans.
				</p>
			)}
			<div className={s.slots}>
				{result.items.map((slot) => (
					<button
						type="button"
						key={slot.start}
						className={s.slot}
						onClick={() => {
							const parts = new Intl.DateTimeFormat("en-CA", {
								timeZone: timezone,
								year: "numeric",
								month: "2-digit",
								day: "2-digit",
							}).formatToParts(new Date(slot.start));
							const part = (type: string) =>
								Number(
									parts.find((p) => p.type === type)!.value,
								);
							onSelect(
								new Date(
									part("year"),
									part("month") - 1,
									part("day"),
								),
								slot.start,
							);
						}}
					>
						<Clock size={18} aria-hidden="true" />
						<span>
							<strong>{day.format(new Date(slot.start))}</strong>
							<span>
								{time.format(new Date(slot.start))}–
								{time.format(new Date(slot.end))}
							</span>
						</span>
						<span className={s.visuallyHidden}>View day</span>
						<ChevronRight size={18} aria-hidden="true" />
					</button>
				))}
			</div>
		</section>
	);
}
