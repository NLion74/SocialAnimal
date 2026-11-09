"use client";

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import EditorFrame from "./EditorFrame";
import BasicRuleEditor from "./BasicRuleEditor";
import {
	decodeBasic,
	encodeBasic,
	describeBasic,
	basicError,
	type BasicFilters,
} from "./basic-rules";
import Feedback from "../../components/Feedback";
import ConditionEditor, {
	emptyCondition,
	type Registry,
} from "./ConditionEditor";
import { conditionSize, describeCondition, operatorLabels } from "./conditions";
import {
	permissionsApi,
	type Ruleset,
	type Condition,
	type Visibility,
} from "./api";
import s from "./Permissions.module.css";

export const visibilityLabels: Record<Visibility, string> = {
	full: "Full details",
	highlight: "Highlight · full details",
	titles: "Titles only",
	busy: "Busy only",
	hidden: "Hidden",
};

export function VisibilitySelect({
	value,
	onChange,
	expert = false,
}: {
	expert?: boolean;
	value: Visibility;
	onChange: (value: Visibility) => void;
}) {
	return (
		<select
			className={s.select}
			value={value}
			onChange={(e) => onChange(e.target.value as Visibility)}
		>
			{Object.entries(visibilityLabels)
				.filter(([key]) => expert || key !== "highlight")
				.map(([key, label]) => (
					<option key={key} value={key}>
						{label}
					</option>
				))}
		</select>
	);
}

export default function RulesetEditor({
	existing,
	onClose,
	onSaved,
	onDeleted,
	embedded,
	onGuard,
}: {
	embedded?: boolean;
	onGuard?: (guard: () => boolean) => void;
	existing?: Ruleset;
	onClose: () => void;
	onSaved: (ruleset: Ruleset) => void;
	onDeleted: (id: string) => void;
}) {
	const formId = useId();
	const [saving, setSaving] = useState(false);
	const [name, setName] = useState(existing?.name || "");

	const [fallback, setFallback] = useState<Visibility>(
		existing?.fallback || "busy",
	);

	const [rules, setRules] = useState<Ruleset["rules"]>(existing?.rules || []);

	const [expert, setExpert] = useState(
		existing?.fallback === "highlight" ||
			existing?.rules.some(
				(rule) =>
					rule.visibility === "highlight" || !decodeBasic(rule.when),
			) ||
			false,
	);

	const [draft, setDraft] = useState<{
		index: number | null;
		filters: BasicFilters;
		visibility: Visibility;
	} | null>(null);
	const dirty =
		name !== (existing?.name || "") ||
		fallback !== (existing?.fallback || "busy") ||
		JSON.stringify(rules) !== JSON.stringify(existing?.rules || []) ||
		!!draft;
	const close = () => {
		if (!saving && (!dirty || confirm("Discard unsaved ruleset changes?")))
			onClose();
	};

	useEffect(() => {
		onGuard?.(
			() =>
				!saving &&
				(!dirty || confirm("Discard unsaved ruleset changes?")),
		);
		return () => onGuard?.(() => true);
	}, [dirty, saving, onGuard]);

	const [registry, setRegistry] = useState<Registry | null>(null);
	const [error, setError] = useState("");
	const hasExpertRules =
		fallback === "highlight" ||
		rules.some(
			(rule) =>
				rule.visibility === "highlight" || !decodeBasic(rule.when),
		);

	useEffect(() => {
		permissionsApi
			.registry()
			.then(setRegistry)
			.catch((e) => setError(e.message));
	}, []);

	const save = async () => {
		setSaving(true);
		setError("");

		try {
			const body = { name, fallback, rules };

			const result = existing
				? await permissionsApi.update(existing.id, {
						...body,
						version: existing.version,
					})
				: await permissionsApi.create(body);

			onSaved(result);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	const updateCondition = (index: number, when: Condition) => {
		if (!registry) return;
		const size = conditionSize(when);

		const otherNodes = rules.reduce(
			(sum, rule, i) =>
				sum + (i === index ? 0 : conditionSize(rule.when).nodes),
			0,
		);

		if (
			size.depth > registry.limits.depth ||
			size.nodes + otherNodes > registry.limits.nodes
		) {
			setError(
				"This change would exceed the ruleset nesting or condition limit.",
			);

			return;
		}

		setError("");

		setRules(
			rules.map((rule, i) => (i === index ? { ...rule, when } : rule)),
		);
	};

	const move = (index: number, direction: number) => {
		const next = [...rules];

		[next[index], next[index + direction]] = [
			next[index + direction],
			next[index],
		];

		setRules(next);
	};

	const remove = async () => {
		if (!existing || !confirm(`Delete “${existing.name}”?`)) return;
		setSaving(true);
		setError("");

		try {
			await permissionsApi.remove(existing.id);
			onDeleted(existing.id);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<EditorFrame
			embedded={embedded}
			onClose={close}
			title={existing ? "Edit ruleset" : "Add ruleset"}
			footer={
				!draft && (
					<div className={s.editorFooter}>
						{existing && (
							<button
								type="button"
								className={s.textButton}
								disabled={saving}
								onClick={() => void remove()}
							>
								<Trash2 size={16} /> Delete ruleset
							</button>
						)}
						<div className={s.footerActions}>
							<button
								type="button"
								className={s.button}
								disabled={saving}
								onClick={close}
							>
								Cancel
							</button>
							<button
								type="submit"
								form={formId}
								className={`${s.button} ${s.primary}`}
								disabled={saving || !registry || !!draft}
							>
								{saving ? "Saving…" : "Save ruleset"}
							</button>
						</div>
					</div>
				)
			}
		>
			<form
				id={formId}
				className={s.editor}
				onSubmit={(e) => {
					e.preventDefault();
					if (!draft) void save();
				}}
			>
				<fieldset className={s.editorFields} disabled={saving}>
					<div hidden={!!draft} className={s.editorFields}>
						<div className={s.rulesetIdentity}>
							<label className={s.field}>
								Name
								<input
									autoFocus
									className={s.input}
									value={name}
									maxLength={80}
									required
									onChange={(e) => setName(e.target.value)}
									placeholder="For close friends"
								/>
							</label>
							<div className={s.fallback}>
								<label className={s.field}>
									Default visibility
									<VisibilitySelect
										expert={expert}
										value={fallback}
										onChange={setFallback}
									/>
								</label>
							</div>
						</div>
						{existing && (
							<p className={s.hint}>
								Changes apply to all calendar shares and links
								using this ruleset.
							</p>
						)}
						<div className={s.editorToolbar}>
							<div>
								<h3>
									{expert ? "Visibility rules" : "Exceptions"}
								</h3>
								<p className={s.hint}>
									The first matching rule decides what is
									shared. Otherwise, default visibility
									applies.
								</p>
							</div>
							<div
								className={s.segmented}
								role="group"
								aria-label="Editing mode"
							>
								<button
									type="button"
									aria-pressed={!expert}
									disabled={hasExpertRules}
									title={
										hasExpertRules
											? "These rules use features available in Expert mode"
											: undefined
									}
									onClick={() => setExpert(false)}
								>
									Basic
								</button>
								<button
									type="button"
									aria-pressed={expert}
									disabled={!!draft}
									onClick={() => setExpert(true)}
								>
									Expert
								</button>
							</div>
						</div>
						{!rules.length && (
							<div className={s.emptyRules}>
								<strong>One visibility for every event</strong>
								<p className={s.hint}>
									Add a rule only when you want different
									visibility for specific events or times.
								</p>
							</div>
						)}
						{registry &&
							rules.map((rule, index) =>
								!expert ? (
									<section
										className={s.basicSummary}
										key={index}
										aria-label={`Rule ${index + 1}`}
									>
										<div>
											<strong>
												{
													visibilityLabels[
														rule.visibility
													]
												}
											</strong>
											<p className={s.hint}>
												{describeBasic(
													decodeBasic(rule.when)!,
												)}
											</p>
										</div>
										<div className={s.row}>
											<button
												type="button"
												className={s.button}
												disabled={!!draft}
												onClick={() =>
													setDraft({
														index,
														filters: decodeBasic(
															rule.when,
														)!,
														visibility:
															rule.visibility,
													})
												}
											>
												Edit exception {index + 1}
											</button>
											<button
												type="button"
												className={s.iconButton}
												aria-label={`Move rule ${index + 1} up`}
												disabled={!index || !!draft}
												onClick={() => move(index, -1)}
											>
												<ArrowUp size={16} />
											</button>
											<button
												type="button"
												className={s.iconButton}
												aria-label={`Move rule ${index + 1} down`}
												disabled={
													index ===
														rules.length - 1 ||
													!!draft
												}
												onClick={() => move(index, 1)}
											>
												<ArrowDown size={16} />
											</button>
											<button
												type="button"
												className={s.iconButton}
												aria-label={`Remove rule ${index + 1}`}
												disabled={!!draft}
												onClick={() =>
													setRules(
														rules.filter(
															(_, i) =>
																i !== index,
														),
													)
												}
											>
												<Trash2 size={16} />
											</button>
										</div>
									</section>
								) : (
									<section
										className={s.ruleCard}
										key={index}
										aria-label={`Rule ${index + 1}`}
									>
										<header className={s.ruleHeader}>
											<h4>Rule {index + 1}</h4>
											<div className={s.ruleActions}>
												<button
													type="button"
													className={s.iconButton}
													aria-label={`Move rule ${index + 1} up`}
													title="Move up"
													disabled={!index}
													onClick={() =>
														move(index, -1)
													}
												>
													<ArrowUp size={16} />
												</button>
												<button
													type="button"
													className={s.iconButton}
													aria-label={`Move rule ${index + 1} down`}
													title="Move down"
													disabled={
														index ===
														rules.length - 1
													}
													onClick={() =>
														move(index, 1)
													}
												>
													<ArrowDown size={16} />
												</button>
												<button
													type="button"
													className={s.iconButton}
													aria-label={`Remove rule ${index + 1}`}
													title="Remove rule"
													onClick={() =>
														setRules(
															rules.filter(
																(_, i) =>
																	i !== index,
															),
														)
													}
												>
													<Trash2 size={16} />
												</button>
											</div>
										</header>
										<div className={s.ruleOutcome}>
											<label className={s.outcomeField}>
												Then show
												<VisibilitySelect
													expert={expert}
													value={rule.visibility}
													onChange={(visibility) =>
														setRules(
															rules.map((r, i) =>
																i === index
																	? {
																			...r,
																			visibility,
																		}
																	: r,
															),
														)
													}
												/>
											</label>
										</div>
										<div className={s.ruleBody}>
											<strong className={s.sectionLabel}>
												When
											</strong>
											<ConditionEditor
												value={rule.when}
												registry={registry}
												expert={expert}
												onChange={(when) =>
													updateCondition(index, when)
												}
											/>
											{expert && (
												<details
													className={s.ruleSummary}
												>
													<summary>
														Read rule as a sentence
													</summary>
													<p>
														{describeCondition(
															rule.when,
															registry.attributes,
															operatorLabels,
														)}
													</p>
												</details>
											)}
										</div>
									</section>
								),
							)}
					</div>
					{draft && (
						<section
							className={s.basicDraft}
							aria-label="Edit exception"
						>
							<h3>
								{draft.index === null
									? "New exception"
									: "Edit exception"}
							</h3>
							<label className={s.field}>
								Visibility
								<VisibilitySelect
									expert={expert}
									value={draft.visibility}
									onChange={(visibility) =>
										setDraft({ ...draft, visibility })
									}
								/>
							</label>
							<BasicRuleEditor
								value={draft.filters}
								onChange={(filters) =>
									setDraft({ ...draft, filters })
								}
							/>
							<div className={s.row}>
								<button
									type="button"
									className={`${s.button} ${s.primary}`}
									onClick={() => {
										const invalid = basicError(
											draft.filters,
										);
										if (invalid) {
											setError(invalid);
											return;
										}
										const rule = {
											when: encodeBasic(draft.filters),
											visibility: draft.visibility,
										};
										const next =
											draft.index === null
												? [...rules, rule]
												: rules.map((old, i) =>
														i === draft.index
															? rule
															: old,
													);
										if (
											registry &&
											next.reduce(
												(sum, item) =>
													sum +
													conditionSize(item.when)
														.nodes,
												0,
											) > registry.limits.nodes
										) {
											setError(
												"This ruleset has too many filters.",
											);
											return;
										}
										setRules(next);
										setDraft(null);
										setError("");
									}}
								>
									Done with exception
								</button>
								<button
									type="button"
									className={s.textButton}
									onClick={() => {
										setDraft(null);
										setError("");
									}}
								>
									Cancel exception
								</button>
							</div>
						</section>
					)}

					<button
						type="button"
						hidden={!!draft}
						className={`${s.button} ${s.addRule}`}
						disabled={
							!!draft ||
							!registry ||
							rules.length >= registry.limits.rules ||
							rules.reduce(
								(sum, rule) =>
									sum + conditionSize(rule.when).nodes,
								0,
							) >= registry.limits.nodes
						}
						onClick={() =>
							!expert
								? setDraft({
										index: null,
										filters: {},
										visibility: "busy",
									})
								: setRules([
										...rules,
										{
											when: emptyCondition(),
											visibility: "busy",
										},
									])
						}
					>
						<Plus size={17} />{" "}
						{expert ? "Add rule" : "Add exception"}
					</button>

					<p hidden={!!draft || !expert} className={s.hint}>
						Date, time, and weekday conditions match any overlap in
						your timezone. “Between” includes both endpoints.
					</p>
				</fieldset>
				{error && (
					<Feedback focusOnMount title="Ruleset not saved">
						{error}
					</Feedback>
				)}
			</form>
		</EditorFrame>
	);
}
