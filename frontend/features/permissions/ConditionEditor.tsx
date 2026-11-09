"use client";

import { Plus, X } from "lucide-react";
import Feedback from "../../components/Feedback";
import { conditionSize, operatorLabels } from "./conditions";
import { permissionsApi, type Condition } from "./api";
import s from "./Permissions.module.css";

export type Registry = Awaited<ReturnType<typeof permissionsApi.registry>>;

export const emptyCondition = (): Condition => ({
	attribute: "timegrid.day",
	operator: "equals",
	value: "monday",
});

export default function ConditionEditor({
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
	const canWrap = depth + conditionSize(value).depth <= registry.limits.depth;

	if ("not" in value)
		return (
			<div className={`${s.group} ${s.negated}`}>
				<div className={s.groupHeader}>
					<span className={s.logicBadge}>NOT</span>
					<strong>Except when</strong>
					<button
						type="button"
						className={s.textButton}
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

		const change = (next: Condition[]) => {
			if (next.length === 1) onChange(next[0]);
			else onChange(key === "all" ? { all: next } : { any: next });
		};

		return (
			<div className={s.group} data-logic={key}>
				<div className={s.groupHeader}>
					<span className={s.logicBadge}>
						{key === "all" ? "AND" : "OR"}
					</span>
					<label className={s.matchLabel}>
						Match
						<select
							className={s.select}
							aria-label="Match conditions"
							value={key}
							onChange={(e) =>
								onChange(
									e.target.value === "all"
										? { all: children }
										: { any: children },
								)
							}
						>
							<option value="all">All conditions</option>
							<option value="any">Any condition</option>
						</select>
					</label>
					{expert && canWrap && (
						<button
							type="button"
							className={s.textButton}
							onClick={() => onChange({ not: value })}
						>
							Invert group (NOT)
						</button>
					)}
				</div>
				<div className={s.groupChildren}>
					{children.map((child, index) => (
						<div key={index}>
							{index > 0 && (
								<div className={s.connector}>
									{key === "all" ? "and" : "or"}
								</div>
							)}
							<div className={s.childCondition}>
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
									className={s.iconButton}
									aria-label={`Remove condition ${index + 1}`}
									title="Remove condition"
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
									<X size={16} />
								</button>
							</div>
						</div>
					))}
				</div>
				<div className={s.row}>
					<button
						type="button"
						className={s.textButton}
						disabled={
							children.length >= registry.limits.children ||
							depth >= registry.limits.depth
						}
						onClick={() => change([...children, emptyCondition()])}
					>
						<Plus size={15} /> Add condition
					</button>
					{expert && (
						<button
							type="button"
							className={s.textButton}
							disabled={
								children.length >= registry.limits.children ||
								depth + 2 > registry.limits.depth
							}
							onClick={() =>
								change([
									...children,
									{
										any: [
											emptyCondition(),
											emptyCondition(),
										],
									},
								])
							}
						>
							<Plus size={15} /> Add nested group
						</button>
					)}
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
		<div className={s.conditionBlock}>
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
								{operatorLabels[operator] || operator}
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
				<p className={s.hint}>
					Case-sensitive RE2 syntax. Lookarounds and backreferences
					are unsupported.
				</p>
			)}
			{depth === 1 && canWrap && (
				<button
					type="button"
					className={s.textButton}
					onClick={() => onChange({ all: [value, emptyCondition()] })}
				>
					<Plus size={15} /> Add condition
				</button>
			)}
			{expert && canWrap && (
				<details className={s.conditionOptions}>
					<summary>Condition options</summary>
					<div className={s.row}>
						<button
							type="button"
							className={s.button}
							onClick={() =>
								onChange({ all: [value, emptyCondition()] })
							}
						>
							Group with AND
						</button>
						<button
							type="button"
							className={s.button}
							onClick={() =>
								onChange({ any: [value, emptyCondition()] })
							}
						>
							Group with OR
						</button>
						<button
							type="button"
							className={s.button}
							onClick={() => onChange({ not: value })}
						>
							Invert (NOT)
						</button>
					</div>
				</details>
			)}
		</div>
	);
}
