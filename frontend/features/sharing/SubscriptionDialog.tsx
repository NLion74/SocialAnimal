"use client";

import { useEffect, useState } from "react";
import {
	Copy,
	ExternalLink,
	Link2,
	Plus,
	RefreshCw,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import Modal from "../../components/Modal";
import { sharingApi } from "./api";
import s from "./Sharing.module.css";

type Permission = "busy" | "titles" | "full";

const labels = {
	busy: "Busy only",
	titles: "Event titles",
	full: "Full details",
};

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
	const [created, setCreated] = useState<Awaited<
		ReturnType<typeof sharingApi.create>
	> | null>(null);
	const [permission, setPermission] = useState<Permission>("full");
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [pending, setPending] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;

		sharingApi
			.list(calendarId)
			.then((rows) => {
				if (active) setSubscriptions(rows);
			})
			.catch((e) => {
				if (active) setError(e.message);
			})
			.finally(() => {
				if (active) setLoading(false);
			});

		return () => {
			active = false;
		};
	}, [calendarId]);

	const update = async (operation: () => Promise<void>) => {
		setPending(true);
		setError("");
		setNotice("");

		try {
			await operation();
			setSubscriptions(await sharingApi.list(calendarId));
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	const create = (replaceId?: string, ceiling = permission) =>
		update(async () => {
			setCreated(await sharingApi.create(calendarId, ceiling, replaceId));
			setNotice(
				replaceId
					? "New links created. The previous links no longer work."
					: "Your sharing links are ready.",
			);
		});

	const copy = async (value: string) => {
		try {
			await navigator.clipboard.writeText(value);
			setNotice("Link copied.");
		} catch {
			setError("Copy failed. Select the link and copy it manually.");
		}
	};

	return (
		<Modal isOpen title={title} onClose={onClose}>
			<div className={s.dialog}>
				<p className={s.description}>
					Let someone view this calendar without an account, or
					subscribe in their calendar app.
				</p>
				<div className={s.permission}>
					<label htmlFor="link-permission">
						<ShieldCheck size={17} /> What can people see?
					</label>
					<select
						id="link-permission"
						className={s.input}
						value={permission}
						disabled={pending}
						onChange={(e) =>
							setPermission(e.target.value as Permission)
						}
					>
						{Object.entries(labels).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
					<p className={s.hint}>
						Links never reveal more than your current access allows.
						Anyone with a link can use it until you revoke it.
					</p>
				</div>
				<button
					className={s.primary}
					disabled={pending || loading}
					onClick={() => create()}
				>
					<Plus size={17} />{" "}
					{pending ? "Saving…" : "Create subscription"}
				</button>
				{error && (
					<p className={s.error} role="alert">
						{error}
					</p>
				)}
				<p className={s.notice} role="status">
					{notice}
				</p>
				{created && (
					<section className={s.links} aria-label="New sharing links">
						<h3>
							<Link2 size={18} /> Save your links
						</h3>
						<p className={s.hint}>
							Copy these now. For your privacy, they cannot be
							retrieved after closing this window.
						</p>
						{[
							{ label: "Preview URL", value: created.previewUrl },
							{ label: "Subscription URL", value: created.url },
						].map(({ label, value }) => (
							<div key={label} className={s.linkField}>
								<label htmlFor={label.replace(" ", "-")}>
									{label === "Preview URL"
										? "Web preview · no account needed"
										: "Calendar app subscription"}
								</label>
								<div className={s.linkRow}>
									<input
										id={label.replace(" ", "-")}
										className={s.input}
										readOnly
										value={value}
										aria-label={label}
										onFocus={(e) => e.target.select()}
									/>
									<button
										className={s.secondary}
										onClick={() => copy(value)}
										aria-label={`Copy ${label}`}
									>
										<Copy size={16} />
									</button>
								</div>
							</div>
						))}
						<a
							className={s.secondary}
							href={created.previewUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							<ExternalLink size={16} /> Open preview
						</a>
					</section>
				)}
				<section className={s.subscriptions} aria-label="Subscriptions">
					<h3>Your subscriptions</h3>
					{loading ? (
						<p className={s.hint}>Loading subscriptions…</p>
					) : subscriptions.length === 0 ? (
						<p className={s.empty}>
							No links yet. Create one to share this calendar.
						</p>
					) : (
						<ul className={s.list}>
							{subscriptions.map((row) => (
								<li key={row.id} className={s.subscription}>
									<div className={s.rowTitle}>
										<strong>
											{labels[row.ceiling as Permission]}
										</strong>
										<span
											className={
												row.revokedAt
													? s.revoked
													: s.active
											}
										>
											{row.revokedAt
												? "Revoked"
												: "Active"}
										</span>
									</div>
									<time
										className={s.hint}
										dateTime={row.createdAt}
									>
										{new Date(
											row.createdAt,
										).toLocaleString()}
									</time>
									{!row.revokedAt && (
										<div className={s.actions}>
											<button
												className={s.secondary}
												disabled={pending}
												onClick={() =>
													create(
														row.id,
														row.ceiling as Permission,
													)
												}
											>
												<RefreshCw size={14} /> Replace
												URL
											</button>
											<button
												className={s.danger}
												disabled={pending}
												onClick={() =>
													update(async () => {
														await sharingApi.revoke(
															row.id,
														);
														if (
															created?.id ===
															row.id
														)
															setCreated(null);
														setNotice(
															"Links revoked. They can no longer be used.",
														);
													})
												}
											>
												<Trash2 size={14} /> Revoke
											</button>
										</div>
									)}
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		</Modal>
	);
}
