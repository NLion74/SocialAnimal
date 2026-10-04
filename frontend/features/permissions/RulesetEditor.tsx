"use client";

import { conditionSize, describeCondition } from "./conditions";
import Feedback from "../../components/Feedback";

import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import {
	permissionsApi,
	type Ruleset,
	type Condition,
	type Visibility,
} from "./api";
import s from "./Permissions.module.css";

type Registry = Awaited<ReturnType<typeof permissionsApi.registry>>;

const labels: Record<string, string> = {
	equals: "is exactly",
	contains: "contains",
	startsWith: "starts with",
	endsWith: "ends with",
	regex: "matches regex",
	before: "is before",
	after: "is after",
	between: "is between",
	greaterThan: "is greater than",
	greaterOrEqual: "is at least",
	lessThan: "is less than",
	lessOrEqual: "is at most",
};

export const visibilityLabels: Record<Visibility, string> = {
	full: "Full details",
	titles: "Titles only",
	busy: "Busy only",
	hidden: "Hidden",
};

const emptyCondition = (): Condition => ({
	attribute: "timegrid.day",
	operator: "equals",
	value: "monday",
});

const simple = (condition: Condition): boolean =>
	"attribute" in condition ||
	(("all" in condition || "any" in condition) &&
		("all" in condition ? condition.all : condition.any).every(
			(child) => "attribute" in child,
		));

export function VisibilitySelect({
	value,
	onChange,
}: {
	value: Visibility;
	onChange: (value: Visibility) => void;
}) {
	return (
		<select
			className={s.select}
			value={value}
			onChange={(e) => onChange(e.target.value as Visibility)}
		>
			{Object.entries(visibilityLabels).map(([key, label]) => (
				<option key={key} value={key}>
					{label}
				</option>
			))}
		</select>
	);
}

function ConditionEditor({
	value,
	onChange,
	registry,
	expert,
	depth = 1,
}: {
	value: Condition;
	onChange: (value: Condition) => void;
	registry: Registry;
	expert: boolean;
	depth?: number;
}) {
	if ("not" in value)
		return (
			<div className={s.group}>
				<div className={s.row}>
					<strong>NOT — invert this group</strong>
					<span className={s.hint}>Nesting level {depth}</span>
					<button
						type="button"
						className={s.button}
						onClick={() => onChange(value.not)}
					>
						Remove NOT
					</button>
				</div>
				<ConditionEditor
					value={value.not}
					onChange={(not) => onChange({ not })}
					registry={registry}
					expert={expert}
					depth={depth + 1}
				/>
			</div>
		);

	if ("all" in value || "any" in value) {
		const key = "all" in value ? "all" : "any";
		const children = "all" in value ? value.all : value.any;

		const change = (next: Condition[]) =>
			onChange(key === "all" ? { all: next } : { any: next });

		return (
			<div className={s.group}>
				<strong>
					{key === "all" ? "ALL (AND)" : "ANY (OR)"} · nesting level{" "}
					{depth}
				</strong>
				<label className={s.field}>
					Match
					<select
						className={s.select}
						value={key}
						onChange={(e) =>
							onChange(
								e.target.value === "all"
									? { all: children }
									: { any: children },
							)
						}
					>
						<option value="all">All conditions (AND)</option>
						<option value="any">Any condition (OR)</option>
					</select>
				</label>
				{children.map((child, index) => (
					<div className={s.stack} key={index}>
						{index > 0 && (
							<span className={s.connector}>
								{key === "all" ? "AND" : "OR"}
							</span>
						)}
						<ConditionEditor
							value={child}
							onChange={(next) =>
								change(
									children.map((c, i) =>
										i === index ? next : c,
									),
								)
							}
							registry={registry}
							expert={expert}
							depth={depth + 1}
						/>
						<button
							type="button"
							className={s.button}
							onClick={() =>
								children.length === 1
									? onChange(emptyCondition())
									: change(
											children.filter(
												(_, i) => i !== index,
											),
										)
							}
						>
							Remove condition
						</button>
					</div>
				))}
				<div className={s.row}>
					<button
						type="button"
						className={s.button}
						disabled={
							children.length >= registry.limits.children ||
							depth >= registry.limits.depth
						}
						onClick={() => change([...children, emptyCondition()])}
					>
						Add condition
					</button>
					{expert &&
						depth + conditionSize(value).depth <=
							registry.limits.depth && (
							<button
								type="button"
								className={s.button}
								onClick={() => onChange({ not: value })}
							>
								Negate group
							</button>
						)}
					<button
						type="button"
						className={s.button}
						disabled={children.length !== 1}
						onClick={() => onChange(children[0])}
					>
						Remove group wrapper
					</button>
				</div>
			</div>
		);
	}

	const attr = registry.attributes.find(
		(item) => item.id === value.attribute,
	);

	if (!attr)
		return (
			<Feedback title="Unknown attribute">
				This condition uses an unavailable attribute. Remove the
				condition or replace the rule before saving.
			</Feedback>
		);

	const initialValue = (type: string, choices?: string[]) =>
		choices?.[0] ??
		(type === "number"
			? 0
			: type === "date"
				? new Date().toISOString().slice(0, 10)
				: type === "time"
					? "13:00"
					: "");

	const input = (
		current: string | number,
		set: (v: string | number) => void,
		label: string,
	) => (
		<label className={s.field} key={label}>
			{label}
			{attr.choices ? (
				<select
					className={s.select}
					value={current}
					onChange={(e) => set(e.target.value)}
				>
					{attr.choices.map((choice) => (
						<option key={choice}>{choice}</option>
					))}
				</select>
			) : (
				<input
					className={s.input}
					type={attr.type === "string" ? "text" : attr.type}
					maxLength={
						value.operator === "regex"
							? registry.limits.regex
							: registry.limits.text
					}
					value={current}
					onChange={(e) =>
						set(
							attr.type === "number"
								? Number(e.target.value)
								: e.target.value,
						)
					}
					required
				/>
			)}
		</label>
	);

	return (
		<div className={s.stack}>
			<div className={s.condition}>
				<label className={s.field}>
					Attribute
					<select
						className={s.select}
						value={value.attribute}
						onChange={(e) => {
							const next = registry.attributes.find(
								(a) => a.id === e.target.value,
							)!;

							onChange({
								attribute: next.id,
								operator: "equals",
								value: initialValue(next.type, next.choices),
							});
						}}
					>
						{registry.attributes.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<label className={s.field}>
					Operator
					<select
						className={s.select}
						value={value.operator}
						onChange={(e) => {
							const first = Array.isArray(value.value)
								? value.value[0]
								: value.value;

							onChange({
								...value,
								operator: e.target.value,
								value:
									e.target.value === "between"
										? [first, first]
										: first,
							});
						}}
					>
						{registry.operators[attr.type].map((operator) => (
							<option key={operator} value={operator}>
								{labels[operator] || operator}
							</option>
						))}
					</select>
				</label>
				<div className={s.row}>
					{Array.isArray(value.value)
						? value.value.map((v, i) =>
								input(
									v,
									(next) =>
										onChange({
											...value,
											value: (
												value.value as (
													string | number
												)[]
											).map((old, j) =>
												i === j ? next : old,
											),
										}),
									i === 0
										? "From (inclusive)"
										: "To (inclusive)",
								),
							)
						: input(
								value.value,
								(next) => onChange({ ...value, value: next }),
								"Value",
							)}
				</div>
			</div>
			{value.operator === "regex" && (
				<p>
					Case-sensitive RE2 syntax. Lookarounds and backreferences
					are unsupported.
				</p>
			)}
			{(expert || depth === 1) && depth < registry.limits.depth && (
				<div className={s.row}>
					<button
						type="button"
						className={s.button}
						onClick={() =>
							onChange({ all: [value, emptyCondition()] })
						}
					>
						Add AND condition
					</button>
					<button
						type="button"
						className={s.button}
						onClick={() =>
							onChange({ any: [value, emptyCondition()] })
						}
					>
						Add OR condition
					</button>
					{expert && (
						<button
							type="button"
							className={s.button}
							onClick={() => onChange({ not: value })}
						>
							Add NOT
						</button>
					)}
				</div>
			)}
		</div>
	);
}

export default function RulesetEditor({
	existing,
	onClose,
	onSaved,
	onDeleted,
}: {
	existing?: Ruleset;
	onClose: () => void;
	onSaved: (ruleset: Ruleset) => void;
	onDeleted: (id: string) => void;
}) {
	const [name, setName] = useState(existing?.name || "");

	const [fallback, setFallback] = useState<Visibility>(
		existing?.fallback || "busy",
	);

	const [rules, setRules] = useState<Ruleset["rules"]>(existing?.rules || []);

	const [expert, setExpert] = useState(
		existing?.rules.some((rule) => !simple(rule.when)) || false,
	);

	const [registry, setRegistry] = useState<Registry | null>(null);
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

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

	const move = (index: number, direction: number) => {
		const next = [...rules];

		[next[index], next[index + direction]] = [
			next[index + direction],
			next[index],
		];

		setRules(next);
	};

	return (
		<Modal
			isOpen
			onClose={onClose}
			title={existing ? "Edit ruleset" : "Add ruleset"}
		>
			<form
				className={s.stack}
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
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
				<p>
					Rules run from top to bottom. The first match wins. Date,
					time, and weekday match any overlap in your timezone.
					Between includes both endpoints.
				</p>
				{existing && (
					<p>
						Saving updates every calendar share using this ruleset,
						including existing subscription links.
					</p>
				)}
				<label className={s.row}>
					<input
						type="checkbox"
						checked={expert}
						disabled={rules.some((rule) => !simple(rule.when))}
						onChange={(e) => setExpert(e.target.checked)}
					/>
					Expert mode · nested AND, OR, NOT
				</label>
				{registry &&
					rules.map((rule, index) => (
						<section className={s.rule} key={index}>
							<div className={s.row}>
								<strong>
									Rule {index + 1} · priority {index}
								</strong>
								<button
									type="button"
									className={s.button}
									aria-label={`Move rule ${index + 1} up`}
									disabled={!index}
									onClick={() => move(index, -1)}
								>
									↑
								</button>
								<button
									type="button"
									className={s.button}
									aria-label={`Move rule ${index + 1} down`}
									disabled={index === rules.length - 1}
									onClick={() => move(index, 1)}
								>
									↓
								</button>
								<button
									type="button"
									className={s.button}
									onClick={() =>
										setRules(
											rules.filter((_, i) => i !== index),
										)
									}
								>
									Remove rule
								</button>
							</div>
							<ConditionEditor
								value={rule.when}
								registry={registry}
								expert={expert}
								onChange={(when) => {
									const size = conditionSize(when);

									if (
										size.depth > registry.limits.depth ||
										size.nodes +
											rules.reduce(
												(sum, other, i) =>
													sum +
													(i === index
														? 0
														: conditionSize(
																other.when,
															).nodes),
												0,
											) >
											registry.limits.nodes
									) {
										setError(
											"This change would exceed the ruleset nesting or condition limit.",
										);

										return;
									}

									setError("");

									setRules(
										rules.map((r, i) =>
											i === index ? { ...r, when } : r,
										),
									);
								}}
							/>
							{expert && (
								<p className={s.expression}>
									{describeCondition(
										rule.when,
										registry.attributes,
										labels,
									)}
								</p>
							)}
							<label className={s.field}>
								Then show
								<VisibilitySelect
									value={rule.visibility}
									onChange={(visibility) =>
										setRules(
											rules.map((r, i) =>
												i === index
													? { ...r, visibility }
													: r,
											),
										)
									}
								/>
							</label>
						</section>
					))}
				<button
					type="button"
					className={s.button}
					disabled={
						!registry ||
						rules.length >= registry.limits.rules ||
						rules.reduce(
							(sum, rule) => sum + conditionSize(rule.when).nodes,
							0,
						) >= registry.limits.nodes
					}
					onClick={() =>
						setRules([
							...rules,
							{ when: emptyCondition(), visibility: "busy" },
						])
					}
				>
					Add rule
				</button>
				<label className={s.field}>
					{rules.length
						? "Otherwise, if no rule matches"
						: "Always show"}
					<VisibilitySelect value={fallback} onChange={setFallback} />
				</label>
				{registry && (
					<p className={s.hint}>
						Up to {registry.limits.rules} rules,{" "}
						{registry.limits.nodes} conditions, and{" "}
						{registry.limits.depth} nesting levels. Empty rulesets
						use only the fallback.
					</p>
				)}
				{error && <Feedback focusOnMount>{error}</Feedback>}
				<div className={s.row}>
					<button
						className={`${s.button} ${s.primary}`}
						disabled={saving || !registry}
					>
						{saving ? "Saving…" : "Save ruleset"}
					</button>
					<button
						type="button"
						className={s.button}
						onClick={onClose}
					>
						Cancel
					</button>
					{existing && (
						<button
							type="button"
							className={s.button}
							disabled={saving}
							onClick={async () => {
								if (!confirm(`Delete “${existing.name}”?`))
									return;

								setSaving(true);

								try {
									await permissionsApi.remove(existing.id);
									onDeleted(existing.id);
								} catch (e) {
									setError((e as Error).message);
								} finally {
									setSaving(false);
								}
							}}
						>
							Delete ruleset
						</button>
					)}
				</div>
			</form>
		</Modal>
	);
}
