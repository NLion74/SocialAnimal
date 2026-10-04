"use client";

import { useState } from "react";
import { adminApi } from "./api";
import Feedback from "../../components/Feedback";
import s from "../permissions/Permissions.module.css";

export default function AccountSecurityActions({
	account,
	onDeleted,
}: {
	account: { id: string; email: string; calendarCount: number };
	onDeleted: () => Promise<void>;
}) {
	const [confirm, setConfirm] = useState<"delete" | "reset" | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	return (
		<div className={s.stack}>
			<h3>Account security</h3>
			{error && <Feedback focusOnMount>{error}</Feedback>}
			{notice && <Feedback tone="success">{notice}</Feedback>}
			{confirm ? (
				<div className={s.notice}>
					<p>
						{confirm === "delete"
							? `Permanently delete ${account.email} and ${account.calendarCount} calendars, including events, connections and shares? This cannot be undone.`
							: `Reset two-factor authentication for ${account.email}? Their sessions and recovery codes will stop working. They must verify email and set up authentication again.`}
					</p>
					<div className={s.row}>
						<button
							type="button"
							className={`${s.button} ${s.danger}`}
							disabled={busy}
							onClick={async () => {
								setBusy(true);
								setError("");
								setNotice("");

								try {
									if (confirm === "delete") {
										await adminApi.deleteUser(account.id);
										await onDeleted();
									} else {
										await adminApi.resetFactor(account.id);

										setNotice(
											"Two-factor authentication reset. Email verification is required on their next sign-in.",
										);
									}

									setConfirm(null);
								} catch (e) {
									setError((e as Error).message);
								} finally {
									setBusy(false);
								}
							}}
						>
							{busy
								? "Please wait…"
								: confirm === "delete"
									? "Permanently delete account"
									: "Confirm factor reset"}
						</button>
						<button
							type="button"
							className={s.button}
							disabled={busy}
							onClick={() => setConfirm(null)}
						>
							Cancel
						</button>
					</div>
				</div>
			) : (
				<div className={s.row}>
					<button
						type="button"
						className={s.button}
						onClick={() => setConfirm("reset")}
					>
						Reset two-factor authentication
					</button>
					<button
						type="button"
						className={`${s.button} ${s.danger}`}
						onClick={() => setConfirm("delete")}
					>
						Delete account
					</button>
				</div>
			)}
		</div>
	);
}
