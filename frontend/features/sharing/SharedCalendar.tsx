"use client";

import { useEffect, useState, useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { sharingApi } from "./api";
import { eventInterval } from "../calendars/api";
import CalendarView from "../calendars/CalendarView";
import f from "../permissions/Permissions.module.css";
import s from "./SharedCalendar.module.css";

type Preview = Awaited<ReturnType<typeof sharingApi.preview>>;

export default function SharedCalendar() {
	const [view, setView] = useState<"list" | "calendar">("calendar");
	const [token, setToken] = useState<string | null>(null);
	const [date, setDate] = useState(() => new Date());
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

			for (let attempt = 0; attempt < 3 && active; attempt++) {
				const query = { token, ...eventInterval(date), limit: 500 };
				const first = await sharingApi.preview(query);
				let cursor = first.nextCursor;
				let changed = false;

				while (cursor && active) {
					const next = await sharingApi.preview({ ...query, cursor });

					if (next.accessRevision !== first.accessRevision) {
						changed = true;
						break;
					}

					first.items.push(...next.items);
					cursor = next.nextCursor;
				}

				if (!active) return;

				if (!changed) {
					setData(first);
					return;
				}
			}

			throw new Error(
				"Calendar access changed. Try again to see its current view.",
			);
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
	}, [token, date, revision]);

	const events = useMemo(
		() =>
			data?.items.map((event) => ({
				...event,
				calendar: { id: "shared", name: data.name, type: "shared" },
			})) || [],
		[data],
	);

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
					<h1>{data?.name || "Shared calendar"}</h1>
					<p>
						Read-only calendar ·{" "}
						{data?.timezone || "Loading timezone…"}
					</p>
				</div>
				{error ? (
					<div className={s.state} role="alert">
						<p>{error}</p>
						<button
							onClick={() => setRevision((value) => value + 1)}
						>
							Try again
						</button>
					</div>
				) : (
					<div className={s.view}>
						<div
							className={f.row}
							role="group"
							aria-label="Preview view"
						>
							<button
								className={`${f.button} ${view === "list" ? f.primary : ""}`}
								aria-pressed={view === "list"}
								onClick={() => setView("list")}
							>
								List
							</button>
							<button
								className={`${f.button} ${view === "calendar" ? f.primary : ""}`}
								aria-pressed={view === "calendar"}
								onClick={() => setView("calendar")}
							>
								Calendar
							</button>
						</div>
						{view === "list" ? (
							<div className={f.stack}>
								<label className={f.field}>
									Month
									<input
										className={f.input}
										type="month"
										value={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`}
										onChange={(e) => {
											if (e.target.value)
												setDate(
													new Date(
														`${e.target.value}-15T12:00:00`,
													),
												);
										}}
									/>
								</label>
								{loading ? (
									<p>Loading events…</p>
								) : !events.length ? (
									<p>No visible events in this interval.</p>
								) : (
									[...events]
										.sort(
											(a, b) =>
												+new Date(a.startTime) -
												+new Date(b.startTime),
										)
										.map((event) => (
											<article
												className={f.event}
												key={event.id}
											>
												<strong>{event.title}</strong>
												<p>
													{new Date(
														event.startTime,
													).toLocaleString(
														undefined,
														{
															timeZone:
																data?.timezone,
														},
													)}{" "}
													—{" "}
													{new Date(
														event.endTime,
													).toLocaleString(
														undefined,
														{
															timeZone:
																data?.timezone,
														},
													)}
												</p>
												{event.location && (
													<p>{event.location}</p>
												)}
												{event.description && (
													<p>{event.description}</p>
												)}
											</article>
										))
								)}
							</div>
						) : (
							<CalendarView
								events={events}
								loading={loading}
								date={date}
								setDate={setDate}
								firstDay={data?.firstDayOfWeek || "monday"}
								timezone={data?.timezone || "UTC"}
							/>
						)}
					</div>
				)}
				<footer className={s.footer}>
					Calendar access is controlled by the person who shared this
					link.
				</footer>
			</section>
		</main>
	);
}
