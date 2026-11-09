"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import ExpirationInput from "../../components/ExpirationInput";
import Feedback from "../../components/Feedback";
import { sharingApi } from "../sharing/api";
import type { CalendarData, Friend } from "../../lib/types";
import type { Ruleset } from "./api";
import { visibilityLabels } from "./RulesetEditor";
import f from "./Permissions.module.css";
import s from "./ShareRules.module.css";

export default function CalendarShareRow({
	calendar,
	friend,
	friendId,
	rulesets,
	readonly,
	open,
	onOpen,
	onChanged,
	onDraftChange,
	onEdit,
	onPreview,
}: {
	calendar: CalendarData;
	friend: Friend;
	friendId: string;
	rulesets: Ruleset[];
	readonly: boolean;
	open: boolean;
	onOpen: () => void;
	onChanged: () => void;
	onDraftChange: (calendarId: string, dirty: boolean) => void;
	onEdit: (ruleset: Ruleset | "new", select: (id: string) => void) => void;
	onPreview: (calendarId: string, rulesetId: string) => void;
}) {
	const panelId = useId();

	const [saved, setSaved] = useState({
		enabled: friend.sharedCalendarIds?.includes(calendar.id) || false,
		rulesetId: friend.sharedCalendarRulesets?.[calendar.id] || "",
		expiresAt: friend.sharedCalendarExpirations?.[calendar.id] || null,
	});

	const [draft, setDraft] = useState(saved);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const defaultId =
		rulesets.find((rule) => rule.seedKey === "full")?.id ||
		rulesets[0]?.id ||
		"";
	const effectiveId = (id: string) =>
		rulesets.some((rule) => rule.id === id) ? id : defaultId;
	const rulesetId = effectiveId(draft.rulesetId);
	const rule = rulesets.find((rule) => rule.id === rulesetId);
	const dirty =
		draft.enabled !== saved.enabled ||
		(draft.enabled &&
			(rulesetId !== effectiveId(saved.rulesetId) ||
				draft.expiresAt !== saved.expiresAt));
	const expired = saved.expiresAt && new Date(saved.expiresAt) <= new Date();
	const savedRule = rulesets.find(
		(rule) => rule.id === effectiveId(saved.rulesetId),
	);

	useEffect(() => {
		onDraftChange(calendar.id, dirty);
		return () => onDraftChange(calendar.id, false);
	}, [calendar.id, dirty, onDraftChange]);

	function change(next: Partial<typeof draft>) {
		setDraft((old) => ({ ...old, ...next }));
		setNotice("");
		setError("");
	}

	async function save() {
		if (readonly || busy || !rulesetId || !dirty) return;

		setBusy(true);
		setNotice("");
		setError("");

		try {
			await sharingApi.set({
				calendarId: calendar.id,
				friendId,
				share: draft.enabled,
				rulesetId,
				expiresAt:
					draft.expiresAt !== saved.expiresAt || !saved.enabled
						? draft.expiresAt
						: undefined,
			});
			const next = { ...draft, rulesetId };
			setSaved(next);
			setDraft(next);
			setNotice(draft.enabled ? "Sharing saved." : "Sharing removed.");
			onChanged();
		} catch (error) {
			setError((error as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className={s.calendar} data-open={open}>
			{!open && (
				<button
					type="button"
					className={s.calendarHeading}
					aria-expanded={open}
					aria-controls={panelId}
					onClick={onOpen}
				>
					<span className={s.calendarIdentity}>
						<strong>{calendar.name}</strong>
						<span>
							{saved.enabled
								? `${savedRule?.name || "Ruleset unavailable"}${expired ? " · Expired" : ""}`
								: "Not shared with this friend"}
						</span>
					</span>
					<span
						className={s.shareStatus}
						data-shared={saved.enabled && !expired}
					>
						{dirty
							? "Unsaved"
							: saved.enabled
								? expired
									? "Expired"
									: "Shared"
								: "Not shared"}
					</span>
					<ChevronDown
						size={18}
						className={open ? s.expanded : undefined}
					/>
				</button>
			)}
			<div id={panelId} hidden={!open}>
				<form
					className={s.calendarBody}
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<fieldset
						className={f.editorFields}
						disabled={readonly || busy}
					>
						<label className={s.shareToggle}>
							<input
								type="checkbox"
								aria-label={calendar.name}
								checked={draft.enabled}
								onChange={(event) =>
									change({ enabled: event.target.checked })
								}
							/>
							Share this calendar
						</label>
						<div className={s.rulesetPicker}>
							<label className={f.field}>
								Ruleset
								<select
									className={f.select}
									value={rulesetId}
									onChange={(event) =>
										change({
											rulesetId: event.target.value,
										})
									}
								>
									{!rulesetId && (
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
							{rule && (
								<button
									type="button"
									className={f.button}
									onClick={() =>
										onEdit(rule, (rulesetId) =>
											change({ rulesetId }),
										)
									}
								>
									Edit ruleset
								</button>
							)}
							<button
								type="button"
								className={f.textButton}
								disabled={rulesets.length >= 32}
								onClick={() =>
									onEdit("new", (rulesetId) =>
										change({ rulesetId }),
									)
								}
							>
								Add ruleset
							</button>
						</div>
						{rule && (
							<p className={s.ruleDescription}>
								{rule.rules.length
									? `${rule.rules.length} ${rule.rules.length === 1 ? "rule" : "rules"}, checked in order. Otherwise: ${visibilityLabels[rule.fallback].toLowerCase()}.`
									: `Every event: ${visibilityLabels[rule.fallback].toLowerCase()}.`}
							</p>
						)}
						<details
							className={s.expiration}
							open={draft.expiresAt ? true : undefined}
						>
							<summary>
								{draft.expiresAt
									? "Sharing expiration"
									: "Set an expiration (optional)"}
							</summary>
							<ExpirationInput
								timezone={calendar.timezone || "UTC"}
								value={draft.expiresAt}
								onChange={(expiresAt) => change({ expiresAt })}
							/>
						</details>
					</fieldset>
					{error && (
						<Feedback focusOnMount title="Sharing was not changed">
							{error} Your changes are still here.
						</Feedback>
					)}
					{notice && <Feedback tone="success">{notice}</Feedback>}
					<div className={s.actions}>
						<button
							type="button"
							className={f.button}
							disabled={!rule || busy}
							onClick={() => onPreview(calendar.id, rulesetId)}
						>
							Preview
						</button>
						<span className={s.saveHint}>
							{dirty ? "Unsaved changes" : ""}
						</span>
						<button
							className={`${f.button} ${f.primary}`}
							disabled={readonly || busy || !rulesetId || !dirty}
						>
							{busy
								? "Saving…"
								: draft.enabled && !saved.enabled
									? "Share calendar"
									: "Save changes"}
						</button>
					</div>
				</form>
			</div>
		</section>
	);
}
