"use client";

import CopyField from "../../components/CopyField";
import Feedback from "../../components/Feedback";

import { useEffect, useState } from "react";
import * as client from "../../lib/generated/client";
import { allPages } from "../../lib/pages";
import s from "./Admin.module.css";
import f from "../permissions/Permissions.module.css";

export default function Invitations() {
	const [items, setItems] = useState<client.invitationsResponse["items"]>([]);
	const [label, setLabel] = useState("");
	const [days, setDays] = useState("7");
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [target, setTarget] = useState("create");
	const [busy, setBusy] = useState(false);

	const load = async () =>
		setItems(await allPages((cursor) => client.invitations({ cursor })));

	useEffect(() => {
		void load().catch((e) => setError(e.message));
	}, []);

	return (
		<section className={s.section}>
			<h2>Registration invitations</h2>
			<p className={f.hint}>
				Each invitation can create one account. Closing registrations
				also blocks invited registrations.
			</p>
			<form
				className={f.row}
				onSubmit={async (e) => {
					e.preventDefault();
					setTarget("create");
					setBusy(true);
					setError("");
					setNotice("");

					try {
						await client.createInvitation({
							body: {
								label,
								expiresAt:
									days === "never"
										? null
										: new Date(
												Date.now() +
													Number(days) * 86400000,
											).toISOString(),
							},
						});

						setLabel("");

						await load().catch(() =>
							setError(
								"The invitation change was saved, but the list could not refresh. Reload this page before making another change.",
							),
						);

						setNotice("Invitation created.");
					} catch (e) {
						setError((e as Error).message);
					} finally {
						setBusy(false);
					}
				}}
			>
				<label className={f.field}>
					Invitation label
					<input
						className={f.input}
						maxLength={100}
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						placeholder="Optional name"
					/>
				</label>
				<label className={f.field}>
					Expires after
					<select
						className={f.select}
						value={days}
						onChange={(e) => setDays(e.target.value)}
					>
						<option value="7">7 days</option>
						<option value="30">30 days</option>
						<option value="never">Never</option>
					</select>
				</label>
				<button className={`${f.button} ${f.primary}`} disabled={busy}>
					{busy ? "Working…" : "Create invitation"}
				</button>
			</form>
			{target === "create" && error && (
				<Feedback focusOnMount>{error}</Feedback>
			)}
			{target === "create" && notice && (
				<Feedback tone="success">{notice}</Feedback>
			)}
			{!items.length && <p>No invitations yet.</p>}
			<ul className={s.invites}>
				{items.map((item) => (
					<li className={s.invite} key={item.id}>
						<div className={f.row}>
							<strong>{item.label || "Invitation"}</strong>
							<span className={`${s.badge} ${s[item.status]}`}>
								{item.status}
							</span>
						</div>
						<p className={s.meta}>
							Created {new Date(item.createdAt).toLocaleString()}{" "}
							·{" "}
							{item.expiresAt
								? `Expires ${new Date(item.expiresAt).toLocaleString()}`
								: "No expiry"}
							{item.usedAt
								? ` · Used ${new Date(item.usedAt).toLocaleString()}`
								: ""}
						</p>
						{target === item.id && error && (
							<Feedback
								focusOnMount
								title="Invitation was not revoked"
							>
								{error}
							</Feedback>
						)}
						{target === item.id && notice && (
							<Feedback tone="success">{notice}</Feedback>
						)}
						{item.code && item.registrationUrl && (
							<>
								<CopyField
									label="Invitation code"
									value={item.code}
									actionLabel="Copy code"
									copiedLabel="Invitation code copied"
								/>
								<CopyField
									label="Registration link"
									value={item.registrationUrl}
									actionLabel="Copy registration link"
									copiedLabel="Registration link copied"
								/>
								<div className={f.row}>
									<button
										className={f.button}
										disabled={busy}
										onClick={async () => {
											setTarget(item.id);
											setBusy(true);
											setError("");
											setNotice("");

											try {
												await client.revokeInvitation({
													id: item.id,
												});

												await load().catch(() =>
													setError(
														"The invitation change was saved, but the list could not refresh. Reload this page before making another change.",
													),
												);

												setNotice(
													"Invitation revoked.",
												);
											} catch (e) {
												setError((e as Error).message);
											} finally {
												setBusy(false);
											}
										}}
									>
										Revoke invitation
									</button>
								</div>
							</>
						)}
					</li>
				))}
			</ul>
		</section>
	);
}
