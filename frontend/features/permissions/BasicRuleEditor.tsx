"use client";

import { useState } from "react";
import {
	basicError,
	weekdays,
	type BasicFilters,
	type Day,
} from "./basic-rules";
import s from "./Permissions.module.css";

const labels = {
	days: "Weekdays",
	time: "Time window",
	date: "Date range",
	title: "Title",
	description: "Description",
};

export default function BasicRuleEditor({
	value,
	onChange,
}: {
	value: BasicFilters;
	onChange: (value: BasicFilters) => void;
}) {
	const [touched, setTouched] = useState(false);
	const change = (next: BasicFilters) => {
		setTouched(true);
		onChange(next);
	};
	const error = basicError(value);

	return (
		<div className={s.stack}>
			{Object.entries(labels)
				.filter(([key]) => key in value)
				.map(([key, label]) => (
					<div className={s.basicFilter} key={key}>
						<div className={s.basicFilterHeading}>
							<strong>{label}</strong>
							<button
								type="button"
								className={s.textButton}
								onClick={() => {
									const next = { ...value };
									delete next[key as keyof BasicFilters];
									change(next);
								}}
								aria-label={`Remove ${label.toLowerCase()} filter`}
							>
								Remove
							</button>
						</div>
						{key === "days" ? (
							<div
								className={s.weekdays}
								role="group"
								aria-label="Weekdays"
							>
								{weekdays.map((day) => (
									<button
										type="button"
										key={day}
										className={s.button}
										aria-label={day}
										aria-pressed={value.days?.includes(day)}
										onClick={() =>
											change({
												...value,
												days: weekdays.filter(
													(candidate) =>
														candidate === day
															? !value.days?.includes(
																	day,
																)
															: value.days?.includes(
																	candidate,
																),
												) as Day[],
											})
										}
									>
										{day.slice(0, 3)}
									</button>
								))}
							</div>
						) : key === "time" || key === "date" ? (
							<div className={s.basicRange}>
								{[0, 1].map((index) => (
									<label className={s.field} key={index}>
										{index ? "Until" : "From"}
										<input
											className={s.input}
											type={key}
											required
											value={value[key]?.[index] || ""}
											onChange={(event) => {
												const range: [string, string] =
													[...value[key]!];
												range[index] =
													event.target.value;
												change({
													...value,
													[key]: range,
												});
											}}
										/>
									</label>
								))}
							</div>
						) : (
							(key === "title" || key === "description") && (
								<div className={s.basicRange}>
									<label className={s.field}>
										Match
										<select
											className={s.select}
											value={value[key]?.operator}
											onChange={(event) =>
												change({
													...value,
													[key]: {
														...value[key]!,
														operator:
															event.target.value,
													},
												})
											}
										>
											<option value="equals">is</option>
											<option value="contains">
												contains
											</option>
										</select>
									</label>
									<label className={s.field}>
										{label}
										<input
											className={s.input}
											required
											maxLength={256}
											value={value[key]?.value || ""}
											onChange={(event) =>
												change({
													...value,
													[key]: {
														...value[key]!,
														value: event.target
															.value,
													},
												})
											}
										/>
									</label>
								</div>
							)
						)}
					</div>
				))}
			{Object.keys(value).length < 5 && (
				<label className={s.field}>
					Add a filter
					<select
						className={s.select}
						value=""
						onChange={(event) => {
							const key = event.target
								.value as keyof BasicFilters;
							if (!key) return;
							change({
								...value,
								[key]:
									key === "days"
										? []
										: key === "time" || key === "date"
											? ["", ""]
											: {
													operator: "contains",
													value: "",
												},
							});
						}}
					>
						<option value="">Choose…</option>
						{Object.entries(labels)
							.filter(([key]) => !(key in value))
							.map(([key, label]) => (
								<option key={key} value={key}>
									{label}
								</option>
							))}
					</select>
				</label>
			)}
			{touched && error && (
				<p className={s.validation} role="alert">
					{error}
				</p>
			)}
			<details className={s.hint}>
				<summary>How filters match</summary>
				<p>
					An event must match every filter. Times use your timezone
					and match any overlap, including endpoints. Text matches are
					case-sensitive.
				</p>
			</details>
		</div>
	);
}
