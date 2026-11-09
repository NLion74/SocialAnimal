"use client";

import CalendarShareRow from "./CalendarShareRow";
import layout from "./ShareRules.module.css";
import CalendarView from "../calendars/CalendarView";
import { useSession } from "../account/SessionProvider";
import { eventInterval } from "../calendars/api";
import Feedback from "../../components/Feedback";

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import EditorFrame from "./EditorFrame";
import { permissionsApi, type Ruleset } from "./api";
import RulesetEditor, { visibilityLabels } from "./RulesetEditor";
import { describeCondition, operatorLabels } from "./conditions";
import type { Registry } from "./ConditionEditor";
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
	onGuard,
	actions,
}: {
	friend: Friend;
	friendId: string;
	calendars: CalendarData[];
	onClose: () => void;
	onChanged: () => void;
	readonly: boolean;
	onGuard?: (guard: () => boolean) => void;
	actions?: ReactNode;
}) {
	const { user } = useSession();

	const editorGuard = useRef<() => boolean>(() => true);
	const setEditorGuard = useCallback((guard: () => boolean) => {
		editorGuard.current = guard;
	}, []);
	const pendingDrafts = useRef(new Set<string>());
	const trackDraft = useCallback((calendarId: string, dirty: boolean) => {
		if (dirty) pendingDrafts.current.add(calendarId);
		else pendingDrafts.current.delete(calendarId);
	}, []);

	const close = () => {
		if (
			pendingDrafts.current.size &&
			!window.confirm("Discard unsaved sharing changes?")
		)
			return;
		onClose();
	};

	useEffect(() => {
		onGuard?.(
			() =>
				editorGuard.current() &&
				(!pendingDrafts.current.size ||
					window.confirm("Discard unsaved sharing changes?")),
		);
		return () => onGuard?.(() => true);
	}, [onGuard]);

	const [selectedCalendar, setSelectedCalendar] = useState<string | null>(
		null,
	);

	const [previewView, setPreviewView] = useState<"list" | "calendar">("list");
	const [previewDate, setPreviewDate] = useState(new Date());
	const [rulesets, setRulesets] = useState<Ruleset[]>([]);

	const [editor, setEditor] = useState<Ruleset | "new" | null>(null);
	const [error, setError] = useState("");
	const selectCreated = useRef<((id: string) => void) | null>(null);
	const [loaded, setLoaded] = useState(false);

	const [preview, setPreview] = useState<{
		calendarId: string;
		rulesetId: string;
		start: string;
		end: string;
	} | null>(null);

	const [registry, setRegistry] = useState<Registry | null>(null);

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

	const loadPreview = async (cursor?: string) => {
		if (!preview) return;
		setPreviewLoading(true);
		setPreviewError("");

		try {
			const [page, attributes] = await Promise.all([
				permissionsApi.preview(preview.calendarId, friendId, {
					rulesetId: preview.rulesetId,
					start: new Date(preview.start).toISOString(),
					end: new Date(preview.end).toISOString(),
					cursor,
				}),
				registry || permissionsApi.registry(),
			]);

			setRegistry(attributes);

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
			<div hidden={!!editor || !!preview}>
				<EditorFrame
					active={!editor && !preview}
					actions={!selectedCalendar ? actions : undefined}
					embedded
					onClose={() =>
						selectedCalendar ? setSelectedCalendar(null) : close()
					}
					title={
						calendars.find(
							(calendar) => calendar.id === selectedCalendar,
						)?.name ||
						target.name ||
						target.email
					}
				>
					<div className={s.stack}>
						{!selectedCalendar && (
							<>
								<section
									className={layout.received}
									aria-label="Shared with you"
								>
									<h3>Shared with you</h3>
									{friend.sharedWithMe?.length ? (
										<ul>
											{friend.sharedWithMe.map(
												(calendar) => (
													<li key={calendar.id}>
														<strong>
															{calendar.name}
														</strong>
														<span>
															{
																calendar.accessLabel
															}
														</span>
													</li>
												),
											)}
										</ul>
									) : (
										<p className={layout.intro}>
											This friend isn’t sharing any
											calendars with you yet.
										</p>
									)}
								</section>
								<h3>Your calendars</h3>
							</>
						)}
						<p className={layout.intro}>
							{selectedCalendar
								? `Sharing with ${target.name || target.email}`
								: "Choose a calendar to manage what this friend can see."}
						</p>
						{readonly && <p>This demo account is read-only.</p>}
						{error && <Feedback focusOnMount>{error}</Feedback>}
						{!loaded && !error && <p>Loading rulesets…</p>}
						{calendars.length === 0 && (
							<p>No calendars to share yet.</p>
						)}
						{loaded &&
							calendars.map((calendar) => (
								<div
									key={calendar.id}
									hidden={
										!!selectedCalendar &&
										selectedCalendar !== calendar.id
									}
								>
									<CalendarShareRow
										key={calendar.id}
										calendar={calendar}
										friend={friend}
										friendId={friendId}
										rulesets={rulesets}
										readonly={readonly}
										open={selectedCalendar === calendar.id}
										onOpen={() =>
											setSelectedCalendar(calendar.id)
										}

										onChanged={onChanged}
										onDraftChange={trackDraft}
										onEdit={(rule, select) => {
											selectCreated.current = select;
											setEditor(rule);
										}}
										onPreview={(calendarId, rulesetId) => {
											setResult(null);
											setPreviewError("");
											setPreviewView("list");

											setPreview({
												calendarId,
												rulesetId,
												start: new Date()
													.toISOString()
													.slice(0, 10),
												end: new Date(
													Date.now() + 30 * 86400000,
												)
													.toISOString()
													.slice(0, 10),
											});
										}}
									/>
								</div>
							))}
					</div>
				</EditorFrame>
			</div>
			{editor && (
				<RulesetEditor
					onGuard={setEditorGuard}
					embedded
					existing={editor === "new" ? undefined : editor}
					onClose={() => setEditor(null)}
					onDeleted={() => {
						setEditor(null);
						void reload();
					}}
					onSaved={(rule) => {
						setRulesets((old) => [
							...old.filter((item) => item.id !== rule.id),
							rule,
						]);

						selectCreated.current?.(rule.id);
						setEditor(null);
						onChanged();
					}}
				/>
			)}
			{preview && (
				<EditorFrame
					embedded
					title="What your friend sees"
					onClose={() => setPreview(null)}
				>
					<div className={s.stack}>
						<p>
							The list shows how your saved rules apply, including
							hidden events. The calendar shows only what your
							friend can see.
						</p>
						<div className={s.previewControls}>
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
							<button
								className={`${s.button} ${s.primary}`}
								disabled={
									previewLoading ||
									!preview.start ||
									!preview.end
								}
								onClick={() => void loadPreview()}
							>
								{previewLoading ? "Loading…" : "Show preview"}
							</button>
						</div>
						{previewError && (
							<Feedback focusOnMount>{previewError}</Feedback>
						)}
						{result && !result.items.length && (
							<p>No events in the selected interval.</p>
						)}
						<div
							className={s.segmented}
							role="group"
							aria-label="Preview view"
						>
							<button
								aria-pressed={previewView === "list"}
								onClick={() => setPreviewView("list")}
							>
								List
							</button>
							<button
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
										highlighted:
											event.visibility === "highlight",
										title:
											event.visibility === "busy"
												? "Busy"
												: event.title,
										description:
											event.visibility === "full" ||
											event.visibility === "highlight"
												? event.description
												: null,
										location:
											event.visibility === "full" ||
											event.visibility === "highlight"
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
									<div className={s.eventHeader}>
										<strong>{event.title}</strong>
										<span
											className={s.visibilityBadge}
											data-visibility={event.visibility}
										>
											{visibilityLabels[event.visibility]}
										</span>
									</div>
									<time
										className={s.hint}
										dateTime={event.startTime}
									>
										{new Date(
											event.startTime,
										).toLocaleString(undefined, {
											timeZone: event.allDay
												? "UTC"
												: event.explanation.timezone,
											dateStyle: "medium",
											...(event.allDay
												? {}
												: { timeStyle: "short" }),
										})}
										{event.allDay ? " · All day" : ""}
									</time>
									<div className={s.eventReason}>
										<p>
											<strong>
												{event.explanation.ruleIndex ===
												null
													? "Default visibility"
													: `Rule ${event.explanation.ruleIndex + 1} matched`}
											</strong>{" "}
											{event.explanation.reason !==
												"First matching rule" &&
												`- ${event.explanation.reason}`}
										</p>
										{event.explanation.ruleIndex !== null &&
											registry &&
											(() => {
												const rule = rulesets.find(
													(row) =>
														row.id ===
														preview.rulesetId,
												)?.rules[
													event.explanation.ruleIndex
												];

												return rule ? (
													<p>
														{describeCondition(
															rule.when,
															registry.attributes,
															operatorLabels,
														)}
													</p>
												) : null;
											})()}
									</div>
									{event.location && (
										<span className={s.hint}>
											{event.location}
										</span>
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
				</EditorFrame>
			)}
		</>
	);
}
