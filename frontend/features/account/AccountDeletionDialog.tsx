"use client";

import { useState } from "react";
import Modal from "../../components/Modal";
import Feedback from "../../components/Feedback";
import { ApiError } from "../../lib/api";
import type {
	beginMyAccountDeletionResponse,
	deleteMeInput,
} from "../../lib/generated/client";
import s from "../permissions/Permissions.module.css";

type Proof = deleteMeInput["body"]["confirmation"];

export default function AccountDeletionDialog({
	description,
	begin,
	remove,
	onClose,
}: {
	description: string;
	begin: (recovery: boolean) => Promise<beginMyAccountDeletionResponse>;
	remove: (confirmation?: Proof) => Promise<void>;
	onClose: () => void;
}) {
	const [challenge, setChallenge] =
		useState<beginMyAccountDeletionResponse | null>(null);

	const [recovery, setRecovery] = useState(false);
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	const submit = async () => {
		setBusy(true);
		setError("");

		try {
			if (!challenge) {
				let next;

				try {
					next = await begin(false);
				} catch (e) {
					if (
						!(e instanceof ApiError) ||
						e.data?.code !== "MAIL_UNAVAILABLE"
					)
						throw e;

					next = await begin(true);
				}

				if (next.required) {
					setChallenge(next);
					setRecovery(next.method === "recovery");
					return;
				}
			}

			await remove(
				challenge?.challenge
					? { challenge: challenge.challenge, code }
					: undefined,
			);

			onClose();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			isOpen
			onClose={() => {
				if (!busy) onClose();
			}}
			title="Confirm account deletion"
		>
			<form
				className={s.stack}
				onSubmit={(e) => {
					e.preventDefault();
					void submit();
				}}
			>
				<p>{description} This cannot be undone.</p>
				{challenge && (
					<>
						<p>
							{recovery
								? "Use one of your saved recovery codes. It can only be used once."
								: challenge.method === "email"
									? "Enter the deletion confirmation code sent to your verified email."
									: "Enter a new code from your authenticator app to confirm deletion."}
						</p>
						<label className={s.field}>
							{recovery
								? "Recovery code"
								: challenge.method === "email"
									? "Email code"
									: "Authenticator code"}
							<input
								autoFocus
								className={s.input}
								inputMode={recovery ? "text" : "numeric"}
								autoComplete={
									recovery ? "off" : "one-time-code"
								}
								required
								maxLength={32}
								value={code}
								onChange={(e) => setCode(e.target.value)}
								disabled={busy}
							/>
						</label>
						{challenge.method !== "recovery" && (
							<button
								type="button"
								className={s.textButton}
								disabled={busy}
								onClick={() => {
									setRecovery(!recovery);
									setCode("");
									setError("");
								}}
							>
								{recovery
									? "Use a two-factor code instead"
									: "Use a recovery code"}
							</button>
						)}
						<button
							type="button"
							className={s.textButton}
							disabled={busy}
							onClick={() => {
								setChallenge(null);
								setCode("");
								setError("");
							}}
						>
							Start again / request another code
						</button>
					</>
				)}
				{error && (
					<Feedback focusOnMount title="Account was not deleted">
						{error}
					</Feedback>
				)}
				<div className={s.row}>
					<button
						type="button"
						className={s.button}
						disabled={busy}
						onClick={onClose}
					>
						Cancel
					</button>
					<button
						type="submit"
						className={`${s.button} ${s.danger}`}
						disabled={busy}
					>
						{busy ? "Please wait…" : "Permanently delete account"}
					</button>
				</div>
			</form>
		</Modal>
	);
}
