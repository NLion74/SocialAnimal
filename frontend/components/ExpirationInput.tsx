"use client";

import { useEffect, useId, useRef, useState } from "react";
import { expirationInstant, expirationLocal } from "../lib/expiration";
import s from "../features/permissions/Permissions.module.css";

export default function ExpirationInput({
	value,
	onChange,
	timezone,
	disabled = false,
	onValidityChange,
}: {
	value: string | null;
	onChange: (value: string | null) => void;
	timezone: string;
	onValidityChange?: (valid: boolean) => void;
	disabled?: boolean;
}) {
	const id = useId();
	const input = useRef<HTMLInputElement>(null);
	const [local, setLocal] = useState(
		value ? expirationLocal(value, timezone) : "",
	);
	const [error, setError] = useState("");

	useEffect(() => {
		setLocal(value ? expirationLocal(value, timezone) : "");
		setError("");
		input.current?.setCustomValidity("");
		onValidityChange?.(true);
	}, [value, timezone, onValidityChange]);

	return (
		<label className={s.field}>
			Expires (optional)
			<input
				ref={input}
				className={s.input}
				type="datetime-local"
				value={local}
				disabled={disabled}
				aria-describedby={id}
				aria-invalid={!!error}
				onChange={(event) => {
					const text = event.target.value;
					setLocal(text);
					setError("");
					event.target.setCustomValidity("");
					onValidityChange?.(true);
					if (!text) {
						onChange(null);
						return;
					}
					try {
						const instant = expirationInstant(text, timezone);
						if (new Date(instant) <= new Date())
							throw new Error(
								`Choose a future time in ${timezone}.`,
							);
						onChange(instant);
					} catch (e) {
						const message = (e as Error).message;
						setError(message);
						event.target.setCustomValidity(message);
						onValidityChange?.(false);
					}
				}}
			/>
			<span id={id} className={s.hint} role={error ? "alert" : undefined}>
				{error ||
					`Calendar owner's timezone: ${timezone}. ${value && new Date(value) <= new Date() ? "Expired — choose a future time to renew, or clear to remove expiration." : "Leave empty for no expiration. A repeated clock-change hour uses its later occurrence."}`}
			</span>
		</label>
	);
}
