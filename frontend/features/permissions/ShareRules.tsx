"use client";

import ExpirationInput from "../../components/ExpirationInput";
import CalendarView from "../calendars/CalendarView";
import { useSession } from "../account/SessionProvider";
import { eventInterval } from "../calendars/api";
import Feedback from "../../components/Feedback";

import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { sharingApi } from "../sharing/api";
import { permissionsApi, type Ruleset } from "./api";
import RulesetEditor, { visibilityLabels } from "./RulesetEditor";
import type { CalendarData, Friend } from "../../lib/types";
import s from "./Permissions.module.css";

type Preview = Awaited<ReturnType<typeof permissionsApi.preview>>;

export default function ShareRules({
	friend,
	friendId,
	calendars,
	onClose,
	onChanged,
	readonly,
}: {
	friend: Friend;
	friendId: string;
	calendars: CalendarData[];
	onClose: () => void;
	onChanged: () => void;
	readonly: boolean;
}) {
	const { user } = useSession();

	const [expirations, setExpirations] = useState<
		Record<string, string | null>
	>(friend.sharedCalendarExpirations || {});

	const [previewView, setPreviewView] = useState<"list" | "calendar">("list");
	const [previewDate, setPreviewDate] = useState(new Date());
	const [rulesets, setRulesets] = useState<Ruleset[]>([]);

	const [selected, setSelected] = useState<Record<string, string>>(
		friend.sharedCalendarRulesets || {},
	);

	const [shared, setShared] = useState(friend.sharedCalendarIds || []);
	const [editor, setEditor] = useState<Ruleset | "new" | null>(null);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [feedbackId, setFeedbackId] = useState<string | null>(null);
	const [notice, setNotice] = useState("");
	const [loaded, setLoaded] = useState(false);

	const [preview, setPreview] = useState<{
		calendarId: string;
		rulesetId: string;
		start: string;
		end: string;
	} | null>(null);

	const [result, setResult] = useState<Preview | null>(null);
	const [previewError, setPreviewError] = useState("");
	const [previewLoading, setPreviewLoading] = useState(false);

	const reload = () =>
		permissionsApi
			.list()
			.then((rows) => {
				setRulesets(rows);
				setLoaded(true);
			})
			.catch((e) => setError(e.message));

	useEffect(() => {
		void reload();
	}, []);

	const defaultId =
		rulesets.find((row) => row.seedKey === "full")?.id ||
		rulesets[0]?.id ||
		"";

	const save = async (
		calendarId: string,
		rulesetId: string,
		enable: boolean,
	) => {
		setBusy(true);
		setFeedbackId(calendarId);
		setNotice("");
		setError("");

		const previousShared = shared;
		const previousSelected = selected;
		setSelected((prev) => ({ ...prev, [calendarId]: rulesetId }));

		setShared((prev) =>
			enable
				? [...new Set([...prev, calendarId])]
				: prev.filter((id) => id !== calendarId),
		);

		try {
			await sharingApi.set({
				calendarId,
				friendId,
				share: enable,
				rulesetId,
				expiresAt: expirations[calendarId] || null,
			});

			setNotice(enable ? "Sharing saved." : "Sharing removed.");
			onChanged();
		} catch (e) {
			setShared(previousShared);
			setSelected(previousSelected);
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const loadPreview = async (cursor?: string) => {
		if (!preview) return;
		setPreviewLoading(true);
		setPreviewError("");

		try {
			const page = await permissionsApi.preview(
				preview.calendarId,
				friendId,
				{
					rulesetId: preview.rulesetId,
					start: new Date(preview.start).toISOString(),
					end: new Date(preview.end).toISOString(),
					cursor,
				},
			);

			setResult((prev) =>
				cursor && prev
					? { ...page, items: [...prev.items, ...page.items] }
					: page,
			);
		} catch (e) {
			setPreviewError((e as Error).message);
		} finally {
			setPreviewLoading(false);
		}
	};

	const target = friend.user1.id === friendId ? friend.user1 : friend.user2;

	return (
		<>
			<Modal
				isOpen
				onClose={onClose}
				title={`Share with ${target.name || target.email}`}
			>
				<div className={s.stack}>
					<p>
						Choose one ruleset for each calendar. Its rules decide
						which events and details your friend can see.
					</p>
					{readonly && <p>This demo account is read-only.</p>}
					{error && !feedbackId && (
						<Feedback focusOnMount>{error}</Feedback>
					)}
					{!loaded && !error && <p>Loading rulesets…</p>}
					{calendars.length === 0 && (
						<p>No calendars to share yet.</p>
					)}
					{calendars.map((calendar) => {
						const id = rulesets.some(
							(row) => row.id === selected[calendar.id],
						)
							? selected[calendar.id]
							: defaultId;

						const rule = rulesets.find((row) => row.id === id);
						const enabled = shared.includes(calendar.id);

						return (
							<section key={calendar.id} className={s.calendar}>
								{feedbackId === calendar.id && error && (
									<Feedback
										focusOnMount
										title="Sharing was not changed"
									>
										{error}
									</Feedback>
								)}
								{feedbackId === calendar.id && notice && (
									<Feedback tone="success">{notice}</Feedback>
								)}
								{feedbackId === calendar.id && busy && (
									<span className={s.hint} role="status">
										Saving sharing…
									</span>
								)}
								<label className={s.row}>
									<input
										type="checkbox"
										checked={enabled}
										disabled={busy || readonly || !id}
										onChange={(e) =>
											void save(
												calendar.id,
												id,
												e.target.checked,
											)
										}
									/>
									<strong>{calendar.name}</strong>
								</label>
								<label className={s.field}>
									Ruleset
									<select
										className={s.select}
										value={id}
										disabled={busy || readonly || !loaded}
										onChange={(e) => {
											if (enabled)
												void save(
													calendar.id,
													e.target.value,
													true,
												);
											else
												setSelected((prev) => ({
													...prev,
													[calendar.id]:
														e.target.value,
												}));
										}}
									>
										{!id && (
											<option value="">
												Create a ruleset to start
											</option>
										)}
										{rulesets.map((row) => (
											<option key={row.id} value={row.id}>
												{row.name}
											</option>
										))}
									</select>
								</label>
								<ExpirationInput
									value={expirations[calendar.id] || null}
									disabled={busy || readonly}
									onChange={(value) =>
										setExpirations((old) => ({
											...old,
											[calendar.id]: value,
										}))
									}
								/>
								{enabled && (
									<button
										className={s.button}
										disabled={busy || readonly}
										onClick={() =>
											void save(calendar.id, id, true)
										}
									>
										Save expiration
									</button>
								)}
								{rule && (
									<div className={s.row}>
										<span className={s.hint}>
											{rule.rules.length
												? `${rule.rules.length} rules · otherwise ${visibilityLabels[rule.fallback].toLowerCase()}`
												: visibilityLabels[
														rule.fallback
													]}
										</span>
										<button
											className={s.button}
											disabled={readonly || busy}
											onClick={() => setEditor(rule)}
										>
											Edit
										</button>
										<button
											className={s.button}
											onClick={() => {
												setResult(null);
												setPreviewError("");

												setPreview({
													calendarId: calendar.id,
													rulesetId: id,
													start: new Date()
														.toISOString()
														.slice(0, 10),
													end: new Date(
														Date.now() +
															30 * 86400000,
													)
														.toISOString()
														.slice(0, 10),
												});
											}}
										>
											Preview
										</button>
									</div>
								)}
							</section>
						);
					})}
					<button
						className={s.button}
						disabled={readonly || busy || rulesets.length >= 32}
						onClick={() => setEditor("new")}
					>
						Add ruleset
					</button>
				</div>
			</Modal>
			{editor && (
				<RulesetEditor
					existing={editor === "new" ? undefined : editor}
					onClose={() => setEditor(null)}
					onDeleted={() => {
						setEditor(null);
						void reload();
					}}
					onSaved={() => {
						setEditor(null);
						void reload();
						onChanged();
					}}
				/>
			)}
			{preview && (
				<Modal
					isOpen
					title="What your friend sees"
					onClose={() => setPreview(null)}
				>
					<div className={s.stack}>
						<p>
							Preview uses the saved ruleset and your friend’s
							attributes. The list includes hidden events and
							private rule explanations; the calendar shows what
							is visible.
						</p>
						<div className={s.row}>
							<label className={s.field}>
								From
								<input
									type="date"
									className={s.input}
									value={preview.start}
									onChange={(e) => {
										setResult(null);

										setPreview({
											...preview,
											start: e.target.value,
										});
									}}
								/>
							</label>
							<label className={s.field}>
								Until
								<input
									type="date"
									className={s.input}
									value={preview.end}
									onChange={(e) => {
										setResult(null);

										setPreview({
											...preview,
											end: e.target.value,
										});
									}}
								/>
							</label>
						</div>
						<button
							className={`${s.button} ${s.primary}`}
							disabled={
								previewLoading || !preview.start || !preview.end
							}
							onClick={() => void loadPreview()}
						>
							{previewLoading ? "Loading…" : "Show preview"}
						</button>
						{previewError && (
							<Feedback focusOnMount>{previewError}</Feedback>
						)}
						{result && !result.items.length && (
							<p>
								No visible events in this page of the selected
								interval.
							</p>
						)}
						<div
							className={s.row}
							role="group"
							aria-label="Preview view"
						>
							<button
								className={`${s.button} ${previewView === "list" ? s.primary : ""}`}
								aria-pressed={previewView === "list"}
								onClick={() => setPreviewView("list")}
							>
								List
							</button>
							<button
								className={`${s.button} ${previewView === "calendar" ? s.primary : ""}`}
								aria-pressed={previewView === "calendar"}
								onClick={() => {
									setPreviewDate(new Date(preview.start));
									setPreviewView("calendar");
								}}
							>
								Calendar
							</button>
						</div>
						{previewView === "calendar" && result && (
							<CalendarView
								events={result.items
									.filter(
										(event) =>
											event.visibility !== "hidden",
									)
									.map((event) => ({
										...event,
										title:
											event.visibility === "busy"
												? "Busy"
												: event.title,
										description:
											event.visibility === "full"
												? event.description
												: null,
										location:
											event.visibility === "full"
												? event.location
												: null,
										calendar: {
											id: preview.calendarId,
											name: "Preview",
											type: "preview",
										},
									}))}
								date={previewDate}
								setDate={(value) => {
									const next =
										typeof value === "function"
											? value(previewDate)
											: value;

									setPreviewDate(next);
									const interval = eventInterval(next);

									const range = {
										...preview,
										start: interval.start.slice(0, 10),
										end: interval.end.slice(0, 10),
									};

									setPreview(range);
									setPreviewLoading(true);

									permissionsApi
										.preview(range.calendarId, friendId, {
											rulesetId: range.rulesetId,
											...interval,
											limit: 500,
										})
										.then(setResult)
										.catch((e) =>
											setPreviewError(e.message),
										)
										.finally(() =>
											setPreviewLoading(false),
										);
								}}
								firstDay={
									user?.settings.firstDayOfWeek || "monday"
								}
								timezone={user?.settings.timezone || "UTC"}
								loading={previewLoading}
							/>
						)}
						{previewView === "list" &&
							result?.items.map((event) => (
								<article key={event.id} className={s.event}>
									<strong>{event.title}</strong>
									<p>
										{event.explanation.ruleIndex === null
											? "Fallback"
											: `Rule ${event.explanation.ruleIndex + 1} (priority ${event.explanation.ruleIndex})`}
										: {event.explanation.reason} →{" "}
										{event.visibility}
									</p>
									<details>
										<summary>Why this visibility?</summary>
										<p>
											Timezone:{" "}
											{event.explanation.timezone}
											{event.explanation.matchedAt
												? `; matching time: ${new Date(event.explanation.matchedAt).toLocaleString(undefined, { timeZone: event.explanation.timezone })}`
												: ""}
										</p>
										<ul>
											{event.explanation.conditions.map(
												(condition) => (
													<li key={condition.path}>
														<strong>
															{condition.path}:{" "}
															{condition.result}
														</strong>{" "}
														— {condition.label}
													</li>
												),
											)}
										</ul>
									</details>
									<span className={s.hint}>
										{new Date(
											event.startTime,
										).toLocaleString()}{" "}
										· {visibilityLabels[event.visibility]}
									</span>
									{event.location && (
										<span>{event.location}</span>
									)}
									{event.description && (
										<p>{event.description}</p>
									)}
								</article>
							))}
						{result?.nextCursor && (
							<button
								className={s.button}
								disabled={previewLoading}
								onClick={() =>
									void loadPreview(result.nextCursor!)
								}
							>
								Load more
							</button>
						)}
					</div>
				</Modal>
			)}
		</>
	);
}
