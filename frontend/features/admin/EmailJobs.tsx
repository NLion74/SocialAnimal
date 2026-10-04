"use client";

import { useEffect, useState } from "react";
import { adminApi } from "./api";
import Feedback from "../../components/Feedback";
import s from "./Admin.module.css";
import f from "../permissions/Permissions.module.css";

type Jobs = Awaited<ReturnType<typeof adminApi.emailJobs>>;

type Status = NonNullable<Parameters<typeof adminApi.emailJobs>[0]>["status"];

export default function EmailJobs({
	administrator,
}: {
	administrator: boolean;
}) {
	const [data, setData] = useState<Jobs | null>(null);
	const [status, setStatus] = useState<Status>();
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [confirm, setConfirm] = useState(false);

	async function load(cursor?: string) {
		setBusy(true);
		setError("");

		try {
			const next = await adminApi.emailJobs({ status, cursor });

			setData((old) =>
				cursor && old
					? { ...next, items: [...old.items, ...next.items] }
					: next,
			);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		void load();
	}, [status]);

	return (
		<section className={s.section}>
			<h2>Email jobs</h2>
			{data && (
				<dl className={s.stats}>
					{Object.entries(data.counts).map(([label, count]) => (
						<div key={label}>
							<dt>{label}</dt>
							<dd>{count.toLocaleString()}</dd>
						</div>
					))}
				</dl>
			)}
			<p className={f.hint}>
				Sent means accepted by the mail server. Completed history is
				retained for 30 days.
			</p>
			{error && <Feedback focusOnMount>{error}</Feedback>}
			{notice && <Feedback tone="success">{notice}</Feedback>}
			<div className={f.row}>
				<label className={f.field}>
					Email status
					<select
						className={f.select}
						value={status || ""}
						onChange={(e) =>
							setStatus((e.target.value as Status) || undefined)
						}
					>
						<option value="">All statuses</option>
						{[
							"queued",
							"running",
							"retrying",
							"sent",
							"failed",
							"expired",
							"cancelled",
						].map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
				<button
					className={f.button}
					disabled={busy}
					onClick={() => void load()}
				>
					Refresh email jobs
				</button>
				{administrator && (
					<button
						className={f.button}
						onClick={() => setConfirm(true)}
					>
						Clear email logs
					</button>
				)}
			</div>
			{confirm && (
				<div className={f.notice}>
					<p>
						Delete completed email history? Pending deliveries and
						retries will remain.
					</p>
					<div className={f.row}>
						<button
							className={`${f.button} ${f.danger}`}
							disabled={busy}
							onClick={async () => {
								setBusy(true);
								setError("");

								try {
									const result =
										await adminApi.clearEmailJobs();

									setConfirm(false);

									setNotice(
										`Cleared ${result.deletedLogs} email logs.`,
									);

									await load();
								} catch (e) {
									setError((e as Error).message);
								} finally {
									setBusy(false);
								}
							}}
						>
							Clear completed email history
						</button>
						<button
							className={f.button}
							onClick={() => setConfirm(false)}
						>
							Cancel
						</button>
					</div>
				</div>
			)}
			<div
				className={s.tableScroll}
				tabIndex={0}
				role="region"
				aria-label="Email jobs"
			>
				<table className={s.table}>
					<thead>
						<tr>
							<th>Type</th>
							<th>Status</th>
							<th>Attempts</th>
							<th>Created</th>
							<th>Finished</th>
						</tr>
					</thead>
					<tbody>
						{data?.items.map((job) => (
							<tr key={job.id}>
								<td>
									{(
										{
											verify: "Email verification",
											request: "Password recovery",
											reset: "Password reset",
											code: "Authentication code",
											changed: "Password changed",
											security: "Security notification",
										} as Record<string, string>
									)[job.kind] || job.kind}
								</td>
								<td>
									{job.status}
									{job.lastError && (
										<div className={s.meta}>
											{job.lastError}
										</div>
									)}
								</td>
								<td>{job.attempts}</td>
								<td>
									{new Date(job.createdAt).toLocaleString()}
								</td>
								<td>
									{job.finishedAt
										? new Date(
												job.finishedAt,
											).toLocaleString()
										: "—"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{data && !data.items.length && (
				<p>No email jobs match this filter.</p>
			)}
			{data?.nextCursor && (
				<button
					className={f.button}
					disabled={busy}
					onClick={() => void load(data.nextCursor!)}
				>
					More email jobs
				</button>
			)}
		</section>
	);
}
