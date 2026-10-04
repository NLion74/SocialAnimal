"use client";

import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import Feedback from "./Feedback";
import s from "./CopyField.module.css";

export default function CopyField({
	label,
	accessibleName = label,
	value,
	actionLabel = "Copy link",
	copiedLabel = "Link copied",
	multiline = false,
	copiedMessage = "Ready to paste and send.",
}: {
	label: string;
	accessibleName?: string;
	value: string;
	actionLabel?: string;
	copiedLabel?: string;
	multiline?: boolean;
	copiedMessage?: string;
}) {
	const id = useId();
	const [copiedValue, setCopiedValue] = useState<string | null>(null);
	const [error, setError] = useState(false);
	const [copying, setCopying] = useState(false);
	const copied = copiedValue === value;
	const Field = multiline ? "textarea" : "input";

	return (
		<div className={`${s.field} ${multiline ? s.multiline : ""}`}>
			<label htmlFor={id}>{label}</label>
			<div className={s.row}>
				<Field
					rows={multiline ? 10 : undefined}
					id={id}
					aria-label={accessibleName}
					className={s.input}
					value={value}
					readOnly
					onFocus={(e) => e.target.select()}
				/>
				<button
					type="button"
					className={`${s.button} ${copied ? s.copied : ""}`}
					disabled={copying}
					aria-label={actionLabel}
					onClick={async () => {
						setCopying(true);
						setError(false);
						setCopiedValue(null);

						try {
							await navigator.clipboard.writeText(value);
							setCopiedValue(value);
						} catch {
							setError(true);
						} finally {
							setCopying(false);
						}
					}}
				>
					{copied ? (
						<Check size={16} aria-hidden="true" />
					) : (
						<Copy size={16} aria-hidden="true" />
					)}
					{copying ? "Copying…" : copied ? "Copied" : actionLabel}
				</button>
			</div>
			{copied && (
				<Feedback tone="success" title={copiedLabel}>
					{copiedMessage}
				</Feedback>
			)}
			{error && (
				<Feedback title="Could not copy">
					Select the link or code above and copy it manually.
				</Feedback>
			)}
		</div>
	);
}
