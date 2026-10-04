"use client";

import ExpirationInput from "../../components/ExpirationInput";
import CopyField from "../../components/CopyField";
import Feedback from "../../components/Feedback";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import Modal from "../../components/Modal";
import { sharingApi } from "./api";
import { permissionsApi, type Ruleset } from "../permissions/api";
import RulesetEditor from "../permissions/RulesetEditor";
import s from "./Sharing.module.css";

type Subscription = Awaited<ReturnType<typeof sharingApi.list>>[number];

type Created = Awaited<ReturnType<typeof sharingApi.create>>;

export default function SubscriptionDialog({
	calendarId,
	title,
	onClose,
}: {
	calendarId: string;
	title: string;
	onClose: () => void;
}) {
	const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
	const [created, setCreated] = useState<Created[]>([]);
	const [rulesets, setRulesets] = useState<Ruleset[]>([]);
	const [rulesetId, setRulesetId] = useState("");
	const [expiresAt, setExpiresAt] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [editing, setEditing] = useState<Subscription | null>(null);
	const [editor, setEditor] = useState<Ruleset | "new" | null>(null);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [pending, setPending] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;

		Promise.all([sharingApi.list(calendarId), permissionsApi.list()])
			.then(([links, rules]) => {
				if (!active) return;
				setSubscriptions(links);
				setRulesets(rules);

				setRulesetId(
					rules.find((rule) => rule.seedKey === "full")?.id ||
						rules[0]?.id ||
						"",
				);
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

			try {
				setSubscriptions(await sharingApi.list(calendarId));
			} catch {
				setError(
					"The change was saved, but the list could not refresh. Close and reopen this dialog.",
				);
			}
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	const create = (replace?: Subscription) =>
		update(async () => {
			const result = await sharingApi.create(
				calendarId,
				replace
					? {
							replaceId: replace.id,
							name: replace.name,
							expiresAt: replace.expiresAt,
							...(replace.rulesetId
								? { rulesetId: replace.rulesetId }
								: { ceiling: replace.ceiling }),
						}
					: {
							name: name.trim() || "Sharing link",
							rulesetId,
							expiresAt,
						},
			);

			setCreated((previous) => [
				...previous.filter((link) => link.id !== replace?.id),
				result,
			]);

			setNotice(
				replace
					? "New links created. The previous links no longer work."
					: "Your sharing links are ready.",
			);
		});

	const rulesSelect = (
		value: string,
		change: (value: string) => void,
		label = "Ruleset",
	) => (
		<label className={s.permission}>
			{label}
			<select
				className={s.input}
				value={value}
				disabled={pending}
				onChange={(e) => change(e.target.value)}
			>
				{!value && <option value="">Choose a ruleset</option>}
				{rulesets.map((rule) => (
					<option key={rule.id} value={rule.id}>
						{rule.name}
					</option>
				))}
			</select>
		</label>
	);

	return (
		<Modal isOpen title={title} onClose={onClose}>
			<div className={s.dialog}>
				<p className={s.description}>
					Create independent sharing links for this calendar. Each
					link has its own ruleset and works without an account.
				</p>
				<label className={s.linkField}>
					Link name
					<input
						className={s.input}
						maxLength={100}
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="Family, work, or another audience"
					/>
				</label>
				{rulesSelect(rulesetId, setRulesetId)}
				<ExpirationInput
					value={expiresAt}
					onChange={setExpiresAt}
					disabled={pending}
				/>
				<div className={s.actions}>
					<button
						className={s.secondary}
						disabled={pending}
						onClick={() => setEditor("new")}
					>
						Add ruleset
					</button>
					<button
						className={s.secondary}
						disabled={pending || !rulesetId}
						onClick={() =>
							setEditor(
								rulesets.find(
									(rule) => rule.id === rulesetId,
								) || null,
							)
						}
					>
						Edit ruleset
					</button>
				</div>
				<p className={s.hint}>
					Visitors are anonymous: friend attributes are unavailable
					and comparisons on them do not match. Calendar, event, date
					and time rules apply. Links never reveal more than your
					current access allows.
				</p>
				<button
					className={s.primary}
					disabled={pending || loading || !rulesetId}
					onClick={() => void create()}
				>
					{pending ? "Working…" : "Create subscription"}
				</button>
				{error && !editing && <Feedback focusOnMount>{error}</Feedback>}
				{notice && <Feedback tone="success">{notice}</Feedback>}
				{created.map((link) => (
					<section
						key={link.id}
						className={s.links}
						aria-label={`New sharing links: ${link.name}`}
					>
						<h3>{link.name}</h3>
						<p className={s.hint}>
							Copy these now. They cannot be retrieved after
							closing this window.
						</p>
						{[
							{ label: "Preview URL", value: link.previewUrl },
							{ label: "Subscription URL", value: link.url },
						].map(({ label, value }) => (
							<CopyField
								key={label}
								label={
									label === "Preview URL"
										? "Web preview · no account needed"
										: "Calendar app subscription"
								}
								accessibleName={label}
								value={value}
								actionLabel={`Copy ${label}`}
								copiedLabel={
									label === "Preview URL"
										? "Preview link copied"
										: "Subscription link copied"
								}
							/>
						))}
						<a
							className={s.secondary}
							href={link.previewUrl}
							target="_blank"
							rel="noopener noreferrer"
						>
							<ExternalLink size={16} /> Open preview
						</a>
					</section>
				))}
				<section className={s.subscriptions} aria-label="Subscriptions">
					<h3>Your subscriptions</h3>
					{loading ? (
						<p>Loading subscriptions…</p>
					) : !subscriptions.length ? (
						<p className={s.empty}>
							No links yet. Create one to share this calendar.
						</p>
					) : (
						<ul className={s.list}>
							{subscriptions.map((row) => (
								<li key={row.id} className={s.subscription}>
									<div className={s.rowTitle}>
										<strong>{row.name}</strong>
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
									<p className={s.hint}>
										{rulesets.find(
											(rule) => rule.id === row.rulesetId,
										)?.name ||
											`Fixed visibility: ${row.ceiling}`}
									</p>
									{row.expiresAt && (
										<p>
											{new Date(row.expiresAt) <=
											new Date()
												? "Expired"
												: "Expires"}
											:{" "}
											{new Date(
												row.expiresAt,
											).toLocaleString()}
										</p>
									)}
									{row.revokedAt && (
										<button
											className={s.danger}
											disabled={pending}
											onClick={() => {
												if (
													confirm(
														"Permanently delete this revoked sharing link?",
													)
												)
													void update(async () => {
														await sharingApi.remove(
															row.id,
														);

														setNotice(
															"Revoked sharing link deleted.",
														);
													});
											}}
										>
											Delete permanently
										</button>
									)}
									{!row.revokedAt && (
										<div className={s.actions}>
											<button
												className={s.secondary}
												disabled={pending}
												onClick={() => {
													setError("");
													setEditing(row);
												}}
											>
												Edit link
											</button>
											<button
												className={s.secondary}
												disabled={pending}
												onClick={() => void create(row)}
											>
												Replace URL
											</button>
											<button
												className={s.danger}
												disabled={pending}
												onClick={() =>
													void update(async () => {
														await sharingApi.revoke(
															row.id,
														);

														setCreated((previous) =>
															previous.filter(
																(link) =>
																	link.id !==
																	row.id,
															),
														);

														setNotice(
															"Links revoked. They can no longer be used.",
														);
													})
												}
											>
												Revoke
											</button>
										</div>
									)}
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
			{editing && (
				<Modal
					isOpen
					title="Edit sharing link"
					onClose={() => setEditing(null)}
				>
					<form
						className={s.dialog}
						onSubmit={(e) => {
							e.preventDefault();

							void update(async () => {
								await sharingApi.update(editing.id, {
									name: editing.name,
									expiresAt: editing.expiresAt,
									...(editing.rulesetId
										? { rulesetId: editing.rulesetId }
										: {}),
								});

								setEditing(null);
								setNotice("Sharing link updated.");
							});
						}}
					>
						<label className={s.linkField}>
							Link name
							<input
								className={s.input}
								required
								maxLength={100}
								value={editing.name}
								onChange={(e) =>
									setEditing({
										...editing,
										name: e.target.value,
									})
								}
							/>
						</label>
						<ExpirationInput
							value={editing.expiresAt}
							onChange={(value) =>
								setEditing({ ...editing, expiresAt: value })
							}
							disabled={pending}
						/>
						{rulesSelect(
							editing.rulesetId || "",
							(value) =>
								setEditing({ ...editing, rulesetId: value }),
							"Link ruleset",
						)}
						{error && <Feedback focusOnMount>{error}</Feedback>}
						<button className={s.primary} disabled={pending}>
							{pending ? "Saving…" : "Save link"}
						</button>
					</form>
				</Modal>
			)}
			{editor && (
				<RulesetEditor
					existing={editor === "new" ? undefined : editor}
					onClose={() => {
						setEditor(null);

						void permissionsApi
							.list()
							.then((rules) => {
								setRulesets(rules);

								setRulesetId((selected) =>
									rules.some((rule) => rule.id === selected)
										? selected
										: rules[0]?.id || "",
								);
							})
							.catch((e) => setError(e.message));
					}}
					onDeleted={(id) => {
						setRulesets((previous) =>
							previous.filter((rule) => rule.id !== id),
						);

						if (rulesetId === id) setRulesetId("");
						setEditor(null);
					}}
					onSaved={(rule) => {
						setRulesets((previous) => [
							...previous.filter((item) => item.id !== rule.id),
							rule,
						]);

						setRulesetId(rule.id);
						setEditor(null);
					}}
				/>
			)}
		</Modal>
	);
}
