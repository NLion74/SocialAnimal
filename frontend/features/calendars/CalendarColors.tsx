"use client";

import { useState } from "react";
import { Palette, Check } from "lucide-react";
import Modal from "../../components/Modal";
import Feedback from "../../components/Feedback";
import type { CalSource } from "../../lib/types";
import { calendarsApi } from "./api";
import { colors, calendarStyle } from "./colors";
import s from "./Calendar.module.css";

export default function CalendarColors({
	sources,
	onSaved,
}: {
	sources: CalSource[];
	onSaved: (sources: CalSource[]) => void;
}) {
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const source = sources.find((item) => item.id === selected) || sources[0];
	const save = async (color: keyof typeof colors | null, owner = false) => {
		if (!source) return;
		setBusy(true);
		setError("");
		setMessage("");
		try {
			if (owner && color) await calendarsApi.update(source.id, { color });
			else if (color) await calendarsApi.setColor(source.id, color);
			else await calendarsApi.resetColor(source.id);
			onSaved(await calendarsApi.sources());
			setMessage(
				owner
					? "Default calendar color saved. People with their own color keep it."
					: "Your calendar color is saved.",
			);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<button className={s.colorButton} onClick={() => setOpen(true)}>
				<Palette size={18} /> Colors
			</button>
			<Modal
				isOpen={open}
				onClose={() => setOpen(false)}
				title="Calendar colors"
			>
				<div className={s.colorSettings}>
					<p>
						Choose a color for your view. Friends’ views stay the
						same.
					</p>
					{error && (
						<Feedback title="Color was not saved">{error}</Feedback>
					)}
					{message && <Feedback tone="success">{message}</Feedback>}
					{source ? (
						<>
							<label>
								Calendar
								<select
									className={s.colorSelect}
									value={source.id}
									disabled={busy}
									onChange={(e) => {
										setSelected(e.target.value);
										setMessage("");
									}}
								>
									{sources.map((item) => (
										<option key={item.id} value={item.id}>
											{item.name}
										</option>
									))}
								</select>
							</label>
							<div
								className={s.palette}
								role="group"
								aria-label="Calendar color"
							>
								{Object.entries(colors).map(([key, color]) => (
									<button
										key={key}
										style={calendarStyle(key)}
										className={s.swatch}
										aria-pressed={source.color === key}
										disabled={busy}
										onClick={() =>
											void save(
												key as keyof typeof colors,
											)
										}
									>
										{source.color === key && (
											<Check size={16} />
										)}{" "}
										{color.label}
									</button>
								))}
							</div>
							<button
								className={s.colorButton}
								disabled={busy}
								onClick={() => void save(null)}
							>
								Use calendar default
							</button>
							{!source.isFriend && (
								<div className={s.defaultColor}>
									<label>
										Default for this calendar
										<select
											className={s.colorSelect}
											value={
												source.defaultColor || "blue"
											}
											disabled={busy}
											onChange={(e) =>
												void save(
													e.target
														.value as keyof typeof colors,
													true,
												)
											}
										>
											{Object.entries(colors).map(
												([key, color]) => (
													<option
														key={key}
														value={key}
													>
														{color.label}
													</option>
												),
											)}
										</select>
									</label>
									<p>
										Used in public previews and by friends
										who haven’t chosen their own color.
									</p>
								</div>
							)}
						</>
					) : (
						<p>
							Import a calendar or ask a friend to share one to
							choose colors.
						</p>
					)}
				</div>
			</Modal>
		</>
	);
}
