"use client";

import s from "../features/permissions/Permissions.module.css";

export default function ExpirationInput({
	value,
	onChange,
	disabled = false,
}: {
	value: string | null;
	onChange: (value: string | null) => void;
	disabled?: boolean;
}) {
	const local = value
		? new Date(
				+new Date(value) - new Date(value).getTimezoneOffset() * 60000,
			)
				.toISOString()
				.slice(0, 16)
		: "";

	return (
		<label className={s.field}>
			Expires (optional)
			<input
				className={s.input}
				type="datetime-local"
				value={local}
				disabled={disabled}
				onChange={(e) =>
					onChange(
						e.target.value
							? new Date(e.target.value).toISOString()
							: null,
					)
				}
			/>
			<span className={s.hint}>
				{value && new Date(value) <= new Date()
					? "Expired — choose a future date to renew."
					: "Leave empty for no expiration. Times use your device timezone."}
			</span>
		</label>
	);
}
