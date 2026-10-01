"use client";

import { useEffect, useState } from "react";
import {
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	ShieldCheck,
} from "lucide-react";
import { sharingApi } from "./api";
import s from "./SharedCalendar.module.css";

type Preview = Awaited<ReturnType<typeof sharingApi.preview>>;

const visibility = {
	busy: "Busy times only",
	titles: "Event titles",
	full: "Full event details",
};

export default function SharedCalendar() {
	const [token, setToken] = useState<string | null>(null);
	const [month, setMonth] = useState(
		() => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
	);
	const [data, setData] = useState<Preview | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [revision, setRevision] = useState(0);

	useEffect(() => {
		const read = () => setToken(window.location.hash.slice(1));
		const refresh = () => setRevision((value) => value + 1);
		read();
		window.addEventListener("hashchange", read);
		window.addEventListener("focus", refresh);
		const timer = window.setInterval(refresh, 60000);

		return () => {
			window.removeEventListener("hashchange", read);
			window.removeEventListener("focus", refresh);
			window.clearInterval(timer);
		};
	}, []);

	useEffect(() => {
		if (token === null) return;
		let active = true;
		setData(null);
		setError("");
		setLoading(true);

		const load = async () => {
			if (!token)
				throw new Error(
					"This sharing link is missing. Ask the calendar owner for a new link.",
				);
			const start = month.toISOString();
			const end = new Date(
				month.getFullYear(),
				month.getMonth() + 1,
				1,
			).toISOString();
			const first = await sharingApi.preview({
				token,
				start,
				end,
				limit: 500,
			});
			let cursor = first.nextCursor;

			while (cursor && active) {
				const next = await sharingApi.preview({
					token,
					start,
					end,
					limit: 500,
					cursor,
				});
				// Permissions can change between pages. Restart instead of mixing visibility levels.
				if (next.permission !== first.permission)
					throw new Error(
						"Calendar access changed. Refresh to see the current view.",
					);
				first.items.push(...next.items);
				cursor = next.nextCursor;
			}

			first.items.sort((a, b) => a.startTime.localeCompare(b.startTime));
			if (active) setData(first);
		};

		void load()
			.catch((e) => {
				if (active)
					setError(
						e.status === 403 || e.status === 404
							? "This sharing link is no longer available. Ask the calendar owner for a new link."
							: e.message,
					);
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [token, month, revision]);

	return (
		<main className={s.page}>
			<header className={s.header}>
				<a href="/" className={s.brand}>
					<CalendarDays size={23} /> SocialAnimal
				</a>
				<span>Shared calendar</span>
			</header>
			<section
				className={s.calendar}
				aria-label="Shared calendar preview"
			>
				<div className={s.heading}>
					<div>
						<h1>{data?.name || "Shared calendar"}</h1>
						<p>
							<ShieldCheck size={16} />{" "}
							{data
								? visibility[
										data.permission as keyof typeof visibility
									]
								: "View this calendar without an account"}
						</p>
					</div>
					<nav className={s.navigation} aria-label="Calendar month">
						<button
							aria-label="Previous month"
							onClick={() =>
								setMonth(
									new Date(
										month.getFullYear(),
										month.getMonth() - 1,
										1,
									),
								)
							}
						>
							<ChevronLeft size={20} />
						</button>
						<h2>
							{month.toLocaleDateString(undefined, {
								month: "long",
								year: "numeric",
							})}
						</h2>
						<button
							aria-label="Next month"
							onClick={() =>
								setMonth(
									new Date(
										month.getFullYear(),
										month.getMonth() + 1,
										1,
									),
								)
							}
						>
							<ChevronRight size={20} />
						</button>
					</nav>
				</div>
				{loading ? (
					<p className={s.state} role="status">
						Loading calendar…
					</p>
				) : error ? (
					<div className={s.state} role="alert">
						<p>{error}</p>
						<button
							onClick={() => setRevision((value) => value + 1)}
						>
							Try again
						</button>
					</div>
				) : !data?.items.length ? (
					<p className={s.state}>No events this month.</p>
				) : (
					<ol className={s.events}>
						{data.items.map((event) => (
							<li key={event.id} className={s.event}>
								<time
									className={s.date}
									dateTime={event.startTime}
								>
									{new Date(
										event.startTime,
									).toLocaleDateString(undefined, {
										weekday: "short",
										month: "short",
										day: "numeric",
										...(event.allDay
											? { timeZone: "UTC" }
											: {}),
									})}
								</time>
								<div>
									<h3>{event.title}</h3>
									<p className={s.time}>
										{event.allDay
											? "All day"
											: `${new Date(event.startTime).toLocaleString()} – ${new Date(event.endTime).toLocaleString()}`}
									</p>
									{event.location && (
										<p className={s.details}>
											{event.location}
										</p>
									)}
									{event.description && (
										<p className={s.details}>
											{event.description}
										</p>
									)}
								</div>
							</li>
						))}
					</ol>
				)}
				<footer className={s.footer}>
					Times are shown in your device’s timezone. Calendar access
					is controlled by the person who shared this link.
				</footer>
			</section>
		</main>
	);
}
