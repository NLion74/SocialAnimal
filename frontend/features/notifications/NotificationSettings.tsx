"use client";

import { useEffect, useState } from "react";
import Feedback from "../../components/Feedback";
import { notificationsApi } from "./api";
import s from "./Notifications.module.css";

const labels = {
	emailFriendRequests: "New friend requests",
	emailFriendAccepted: "Accepted friend requests",
	emailHighlights: "Events highlighted for you",
	emailSyncFailures: "Calendar sync failures",
} as const;

export default function NotificationSettings() {
	const [settings, setSettings] = useState<Awaited<
		ReturnType<typeof notificationsApi.settings>
	> | null>(null);
	const [error, setError] = useState("");
	const [saved, setSaved] = useState(false);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		notificationsApi
			.settings()
			.then(setSettings)
			.catch((e) => setError(e.message));
	}, []);

	return (
		<section className={s.panel} aria-label="Notification preferences">
			<h2>Email notifications</h2>
			<p className={s.muted}>
				Updates appear in the app. Choose which ones also arrive by
				email once your address is verified. Security emails are always
				sent when needed.
			</p>
			{error && (
				<Feedback title="Notification settings were not saved">
					{error}
				</Feedback>
			)}
			{saved && (
				<Feedback tone="success" title="Notification settings saved">
					Your email preferences are up to date.
				</Feedback>
			)}
			{settings && (
				<form
					onSubmit={async (event) => {
						event.preventDefault();
						setBusy(true);
						setError("");
						setSaved(false);
						try {
							setSettings(
								await notificationsApi.updateSettings(settings),
							);
							setSaved(true);
						} catch (e) {
							setError((e as Error).message);
						} finally {
							setBusy(false);
						}
					}}
				>
					<fieldset className={s.preferences} disabled={busy}>
						<legend className={s.muted}>Send me email about</legend>
						{Object.entries(labels).map(([key, label]) => (
							<label key={key}>
								<input
									type="checkbox"
									checked={
										settings[key as keyof typeof labels]
									}
									onChange={(e) => {
										setSettings({
											...settings,
											[key]: e.target.checked,
										});
										setSaved(false);
									}}
								/>
								{label}
							</label>
						))}
					</fieldset>
					<button className={s.textButton} disabled={busy}>
						{busy ? "Saving…" : "Save email preferences"}
					</button>
				</form>
			)}
		</section>
	);
}
