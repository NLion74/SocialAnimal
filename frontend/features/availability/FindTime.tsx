"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarSearch, ChevronLeft, ChevronRight } from "lucide-react";
import Modal from "../../components/Modal";
import Feedback from "../../components/Feedback";
import { friendsApi } from "../friends/api";
import { calendarsApi } from "../calendars/api";
import { useSession } from "../account/SessionProvider";
import { availabilityApi } from "./api";
import SearchResults from "./SearchResults";
import s from "./FindTime.module.css";

type Person = { id: string; name: string; shared: number };
type CalendarChoice = { id: string; name: string };
type Step = "people" | "when" | "results";

function dateInZone(timezone: string, offset = 0) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const get = (type: string) =>
		parts.find((part) => part.type === type)!.value;
	const date = new Date(
		`${get("year")}-${get("month")}-${get("day")}T12:00:00Z`,
	);
	date.setUTCDate(date.getUTCDate() + offset);
	return date.toISOString().slice(0, 10);
}

function toggle(ids: string[], id: string) {
	return ids.includes(id)
		? ids.filter((value) => value !== id)
		: [...ids, id];
}

export default function FindTime({
	timezone,
	onSelect,
	disabled = false,
}: {
	timezone: string;
	disabled?: boolean;
	onSelect: (date: Date, instant: string) => void;
}) {
	const { user } = useSession();
	const formId = useId();
	const heading = useRef<HTMLHeadingElement>(null);
	const requestId = useRef(0);
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<Step>("people");
	const [friends, setFriends] = useState<Person[]>([]);
	const [calendars, setCalendars] = useState<CalendarChoice[]>([]);
	const [friendIds, setFriendIds] = useState<string[]>([]);
	const [calendarIds, setCalendarIds] = useState<string[] | null>(null);
	const [start, setStart] = useState(() => dateInZone(timezone));
	const [end, setEnd] = useState(() => dateInZone(timezone, 6));
	const [from, setFrom] = useState("09:00");
	const [to, setTo] = useState("21:00");
	const [minutes, setMinutes] = useState(60);
	const [includeAllDay, setIncludeAllDay] = useState(true);
	const [busy, setBusy] = useState(false);
	const [loading, setLoading] = useState(false);
	const [retry, setRetry] = useState(0);
	const [loadError, setLoadError] = useState("");
	const [error, setError] = useState("");
	const [result, setResult] = useState<Awaited<
		ReturnType<typeof availabilityApi.search>
	> | null>(null);

	useEffect(() => {
		if (!open || !user?.id) return;
		let active = true;
		setLoading(true);
		setLoadError("");

		Promise.all([friendsApi.list(), calendarsApi.list()])
			.then(([rows, own]) => {
				if (!active) return;
				const people = rows
					.filter((row) => row.status === "accepted")
					.map((row) => {
						const friend =
							row.user1.id === user.id ? row.user2 : row.user1;
						return {
							id: friend.id,
							name: friend.name || friend.email,
							shared: row.sharedWithMe?.length || 0,
						};
					});
				setFriends(people);
				setFriendIds((ids) =>
					ids.filter((id) =>
						people.some((p) => p.id === id && p.shared),
					),
				);
				setCalendars(own);
				setCalendarIds((ids) =>
					ids === null
						? own.map((c) => c.id)
						: ids.filter((id) => own.some((c) => c.id === id)),
				);
			})
			.catch((e) => {
				if (active) setLoadError(e.message);
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [open, user?.id, retry]);

	useEffect(() => {
		if (open) heading.current?.focus();
	}, [open, step]);

	const close = () => {
		requestId.current++;
		setBusy(false);
		setOpen(false);
	};
	const selectedCalendars = calendarIds || [];
	const selectionSummary = `${friendIds.length} ${friendIds.length === 1 ? "friend" : "friends"}, ${selectedCalendars.length} of your calendars`;

	return (
		<>
			<button
				className={s.launch}
				disabled={disabled}
				onClick={() => {
					setStep("people");
					setOpen(true);
					setStart(dateInZone(timezone));
					setEnd(dateInZone(timezone, 6));
					setResult(null);
					setError("");
				}}
			>
				<CalendarSearch size={18} aria-hidden="true" /> Find a time
			</button>
			<Modal
				isOpen={open}
				onClose={close}
				title="Find a time"
				size="wide"
				footer={
					<div className={s.footer}>
						{step !== "people" && (
							<button
								type="button"
								className={s.launch}
								disabled={busy}
								onClick={() => {
									setError("");
									setStep(
										step === "results" ? "when" : "people",
									);
								}}
							>
								<ChevronLeft size={18} aria-hidden="true" />
								{step === "results" ? "Edit search" : "Back"}
							</button>
						)}
						{step === "people" && (
							<button
								type="button"
								className={`${s.launch} ${s.primary}`}
								disabled={
									loading || !!loadError || !friendIds.length
								}
								onClick={() => setStep("when")}
							>
								Choose times{" "}
								<ChevronRight size={18} aria-hidden="true" />
							</button>
						)}
						{step === "when" && (
							<button
								type="submit"
								form={formId}
								className={`${s.launch} ${s.primary}`}
								disabled={busy}
							>
								{busy
									? "Finding times…"
									: "Show suggested times"}
							</button>
						)}
					</div>
				}
			>
				<div className={s.form}>
					<div className={s.stepHeader}>
						<h3 ref={heading} tabIndex={-1}>
							{step === "people"
								? "People & calendars"
								: step === "when"
									? "When works for you?"
									: "Suggested times"}
						</h3>
						{step !== "results" && (
							<span className={s.help}>
								Step {step === "people" ? 1 : 2} of 2
							</span>
						)}
					</div>
					{step === "people" && (
						<>
							<p className={s.help}>
								Choose friends and the calendars to check for
								your own plans.
							</p>
							{loading ? (
								<p role="status">
									Loading calendars and friends…
								</p>
							) : loadError ? (
								<Feedback title="Could not load your choices">
									{loadError}
									<button
										className={s.launch}
										onClick={() =>
											setRetry((value) => value + 1)
										}
									>
										Try again
									</button>
								</Feedback>
							) : (
								<div className={s.choices}>
									<fieldset className={s.fields}>
										<legend>Friends</legend>
										<p className={s.help}>
											Choose up to 10. We check the
											calendars they share with you.
										</p>
										{!friends.length && (
											<p className={s.help}>
												No friends yet.{" "}
												<a href="/friends">
													Add a friend
												</a>{" "}
												to get started.
											</p>
										)}
										<div className={s.choiceList}>
											{friends.map((friend) => (
												<label
													key={friend.id}
													className={s.choice}
												>
													<input
														type="checkbox"
														checked={friendIds.includes(
															friend.id,
														)}
														disabled={
															!friend.shared ||
															(!friendIds.includes(
																friend.id,
															) &&
																friendIds.length >=
																	10)
														}
														onChange={() =>
															setFriendIds(
																(ids) =>
																	toggle(
																		ids,
																		friend.id,
																	),
															)
														}
													/>
													<span>
														<strong>
															{friend.name}
														</strong>
														<span>
															{friend.shared
																? `${friend.shared} shared ${friend.shared === 1 ? "calendar" : "calendars"}`
																: "Needs to share a calendar with you"}
														</span>
													</span>
												</label>
											))}
										</div>
									</fieldset>
									<fieldset className={s.fields}>
										<legend>Your calendars</legend>
										<p className={s.help}>
											Only selected calendars affect your
											availability.
										</p>
										{!!calendars.length && (
											<div className={s.selectionTools}>
												<span>
													{selectedCalendars.length}{" "}
													selected
												</span>
												<button
													type="button"
													className={s.textButton}
													onClick={() =>
														setCalendarIds(
															calendars.map(
																(c) => c.id,
															),
														)
													}
												>
													Select all
												</button>
												<button
													type="button"
													className={s.textButton}
													onClick={() =>
														setCalendarIds([])
													}
												>
													Clear
												</button>
											</div>
										)}
										<div className={s.choiceList}>
											{calendars.map((calendar) => (
												<label
													key={calendar.id}
													className={s.choice}
												>
													<input
														type="checkbox"
														checked={selectedCalendars.includes(
															calendar.id,
														)}
														onChange={() =>
															setCalendarIds(
																(ids) =>
																	toggle(
																		ids ||
																			[],
																		calendar.id,
																	),
															)
														}
													/>
													<span>
														<strong>
															{calendar.name}
														</strong>
													</span>
												</label>
											))}
										</div>
										{!selectedCalendars.length && (
											<p className={s.selectionNote}>
												Only your friends’ calendars
												will be checked. Your own
												availability won’t be included.
											</p>
										)}
									</fieldset>
								</div>
							)}
						</>
					)}
					{step === "when" && (
						<form
							id={formId}
							className={s.form}
							onSubmit={async (event) => {
								event.preventDefault();
								setBusy(true);
								setError("");
								const id = ++requestId.current;
								try {
									const response =
										await availabilityApi.search({
											friendIds,
											calendarIds: selectedCalendars,
											start,
											end,
											from,
											to,
											minutes,
											includeAllDay,
										});
									if (id !== requestId.current) return;
									setResult(response);
									setStep("results");
								} catch (e) {
									if (id === requestId.current)
										setError((e as Error).message);
								} finally {
									if (id === requestId.current)
										setBusy(false);
								}
							}}
						>
							<p className={s.help}>
								{selectionSummary}. All times in {timezone}.
							</p>
							<fieldset disabled={busy} className={s.fields}>
								<legend className={s.visuallyHidden}>
									Dates and times
								</legend>
								<div
									className={s.shortcuts}
									aria-label="Date shortcuts"
								>
									<button
										type="button"
										className={s.launch}
										onClick={() => {
											setStart(dateInZone(timezone));
											setEnd(dateInZone(timezone));
										}}
									>
										Today
									</button>
									<button
										type="button"
										className={s.launch}
										onClick={() => {
											setStart(dateInZone(timezone));
											setEnd(dateInZone(timezone, 6));
										}}
									>
										Next 7 days
									</button>
								</div>
								<div className={s.grid}>
									<label>
										From date
										<input
											type="date"
											required
											value={start}
											onChange={(e) => {
												setStart(e.target.value);
												if (e.target.value > end)
													setEnd(e.target.value);
											}}
										/>
									</label>
									<label>
										Through date
										<input
											type="date"
											required
											min={start}
											value={end}
											onChange={(e) =>
												setEnd(e.target.value)
											}
										/>
									</label>
									<label>
										Earliest time
										<input
											type="time"
											required
											value={from}
											onChange={(e) =>
												setFrom(e.target.value)
											}
										/>
									</label>
									<label>
										Latest time
										<input
											type="time"
											required
											value={to}
											onChange={(e) =>
												setTo(e.target.value)
											}
										/>
									</label>
								</div>
								<label className={s.duration}>
									Time needed
									<select
										value={minutes}
										onChange={(e) =>
											setMinutes(Number(e.target.value))
										}
									>
										{[
											15, 30, 45, 60, 90, 120, 180, 240,
										].map((value) => (
											<option key={value} value={value}>
												{value < 60
													? `${value} minutes`
													: `${value / 60} ${value === 60 ? "hour" : "hours"}`}
											</option>
										))}
									</select>
								</label>
								<label className={s.choice}>
									<input
										type="checkbox"
										checked={includeAllDay}
										onChange={(e) =>
											setIncludeAllDay(e.target.checked)
										}
									/>
									<span>
										<strong>
											Count all-day events as busy
										</strong>
										<span>
											Turn off to ignore holidays and
											all-day reminders.
										</span>
									</span>
								</label>
								<p className={s.help}>
									Search up to 31 days. Hidden events and
									events marked “free” never block time.
								</p>
							</fieldset>
							{error && (
								<Feedback
									focusOnMount
									title="Could not find times"
								>
									{error}
								</Feedback>
							)}
						</form>
					)}
					{step === "results" && result && (
						<SearchResults
							result={result}
							timezone={timezone}
							userId={user?.id}
							friends={friends}
							includeAllDay={includeAllDay}
							ownCalendars={selectedCalendars.length}
							summary={selectionSummary}
							onSelect={(date, instant) => {
								onSelect(date, instant);
								close();
							}}
						/>
					)}
				</div>
			</Modal>
		</>
	);
}
