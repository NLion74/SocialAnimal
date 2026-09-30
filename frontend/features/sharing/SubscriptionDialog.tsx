"use client";

import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { sharingApi } from "./api";
import s from "../calendars/Dashboard.module.css";

export default function SubscriptionDialog({
	calendarId,
	title,
	onClose,
}: {
	calendarId: string;
	title: string;
	onClose: () => void;
}) {
	const [subscriptions, setSubscriptions] = useState<
		Awaited<ReturnType<typeof sharingApi.list>>
	>([]);

	const [url, setUrl] = useState("");
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const load = () => sharingApi.list(calendarId).then(setSubscriptions);

	useEffect(() => {
		void load().catch((e) => setError(e.message));
	}, [calendarId]);

	const create = async (replaceId?: string) => {
		setPending(true);
		setError("");

		try {
			const result = await sharingApi.create(calendarId);
			setUrl(result.url);
			if (replaceId) await sharingApi.revoke(replaceId);
			await load();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	return (
		<Modal isOpen title={title} onClose={onClose}>
			<div className={s.modalHeader}>
				<h2 className={s.modalTitle}>{title}</h2>
			</div>
			<div className={s.modalBody}>
				<p>
					Replace subscriptions created before REST v1. New URLs are
					shown only once.
				</p>
				{error && <p role="alert">{error}</p>}
				{url && (
					<>
						<input
							className={s.input}
							readOnly
							value={url}
							aria-label="Subscription URL"
						/>
						<button
							className={s.btn}
							onClick={() =>
								navigator.clipboard
									.writeText(url)
									.catch(() =>
										setError(
											"Copy failed. Select and copy the URL.",
										),
									)
							}
						>
							Copy URL
						</button>
					</>
				)}
				<button
					className={s.btn}
					disabled={pending}
					onClick={() => create()}
				>
					Create subscription
				</button>
				{subscriptions.map((row) => (
					<div key={row.id}>
						<span>
							{new Date(row.createdAt).toLocaleString()} ·{" "}
							{row.ceiling} ·{" "}
							{row.revokedAt ? "Revoked" : "Active"}
						</span>
						{!row.revokedAt && (
							<>
								<button
									className={s.btn}
									disabled={pending}
									onClick={() => create(row.id)}
								>
									Replace URL
								</button>
								<button
									className={s.btn}
									disabled={pending}
									onClick={() =>
										sharingApi
											.revoke(row.id)
											.then(load)
											.catch((e) => setError(e.message))
									}
								>
									Revoke
								</button>
							</>
						)}
					</div>
				))}
			</div>
		</Modal>
	);
}
