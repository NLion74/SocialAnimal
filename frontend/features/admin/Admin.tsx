"use client";

import Feedback from "../../components/Feedback";

import { useEffect, useState, useRef } from "react";
import { useSession } from "../account/SessionProvider";
import { adminApi } from "./api";
import EmailJobs from "./EmailJobs";
import AccountSecurityActions from "./AccountSecurityActions";
import Invitations from "./Invitations";
import Modal from "../../components/Modal";
import s from "./Admin.module.css";
import f from "../permissions/Permissions.module.css";

type User = Awaited<ReturnType<typeof adminApi.users>>["items"][number];

type Settings = Awaited<ReturnType<typeof adminApi.settings>>;

const sections = {
	activity: "Overview",
	"instance-settings": "Settings",
	users: "Users",
	"sync-logs": "Sync logs",
	"email-jobs": "Email jobs",
	invitations: "Invitations",
};
type Section = keyof typeof sections;

const roleLabels = {
	admin: "Administrator",
	moderator: "Moderator",
	normal: "Normal",
	readonly: "Read-only demo",
};

export default function Admin() {
	const { user, refresh } = useSession();
	const allowed = user?.isAdmin || user?.accountRole === "moderator";

	const [stats, setStats] = useState<Awaited<
		ReturnType<typeof adminApi.stats>
	> | null>(null);

	const [users, setUsers] = useState<Awaited<
		ReturnType<typeof adminApi.users>
	> | null>(null);

	const [logs, setLogs] = useState<Awaited<
		ReturnType<typeof adminApi.logs>
	> | null>(null);

	const sectionContent = useRef<HTMLDivElement>(null);
	const [section, setSection] = useState<Section>("activity");
	const [mobileDetail, setMobileDetail] = useState(false);
	const [visited, setVisited] = useState<Partial<Record<Section, boolean>>>({
		activity: true,
	});
	const [sectionError, setSectionError] = useState("");
	const [sectionLoading, setSectionLoading] = useState(false);
	const [retry, setRetry] = useState(0);
	const chooseSection = (next: Section) => {
		setSection(next);
		setMobileDetail(true);
		setVisited((old) => ({ ...old, [next]: true }));
	};

	useEffect(() => {
		if (!mobileDetail) return;
		sectionContent.current?.focus({ preventScroll: true });
		sectionContent.current?.scrollIntoView({ block: "start" });
	}, [section, mobileDetail]);

	const [settings, setSettings] = useState<Settings | null>(null);
	const [query, setQuery] = useState("");

	const [status, setStatus] = useState<
		"" | "queued" | "running" | "succeeded" | "failed"
	>("");

	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const [clearing, setClearing] = useState(false);
	const [editing, setEditing] = useState<User | null>(null);
	const [editError, setEditError] = useState("");
	const [resetNotice, setResetNotice] = useState("");
	const [resetPending, setResetPending] = useState(false);
	const [feedbackScope, setFeedbackScope] = useState("activity");
	const [settingsError, setSettingsError] = useState("");
	const [settingsNotice, setSettingsNotice] = useState("");
	const [savingSettings, setSavingSettings] = useState(false);
	const [settingsDirty, setSettingsDirty] = useState(false);

	const userRequest = useRef(0);
	const logRequest = useRef(0);
	const loadUsers = async (cursor?: string) => {
		const sequence = ++userRequest.current;
		const next = await adminApi.users({ query, cursor });
		if (sequence !== userRequest.current) return;

		setUsers((prev) =>
			cursor && prev
				? { ...next, items: [...prev.items, ...next.items] }
				: next,
		);
	};

	const loadLogs = async (cursor?: string) => {
		const sequence = ++logRequest.current;
		const next = await adminApi.logs({
			status: status || undefined,
			cursor,
		});

		if (sequence !== logRequest.current) return;
		setLogs((prev) =>
			cursor && prev
				? { ...next, items: [...prev.items, ...next.items] }
				: next,
		);
	};

	useEffect(() => {
		if (!allowed) return;
		let active = true;
		setSectionError("");
		const request =
			section === "activity" && !stats
				? adminApi.stats().then(setStats)
				: section === "users" && !users
					? loadUsers()
					: section === "sync-logs" && !logs
						? loadLogs()
						: section === "instance-settings" &&
							  user?.isAdmin &&
							  !settings
							? adminApi.settings().then(setSettings)
							: null;
		setSectionLoading(!!request);
		request
			?.catch((error) => {
				if (active) setSectionError(error.message);
			})
			.finally(() => {
				if (active) setSectionLoading(false);
			});
		return () => {
			active = false;
		};
		// Data and drafts stay in this component when a section is hidden.
	}, [section, allowed, user?.isAdmin, retry]);

	const action = async (fn: () => Promise<unknown>, scope = "activity") => {
		setFeedbackScope(scope);
		setBusy(true);
		setError("");
		setNotice("");

		try {
			await fn();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	const settingsAction = async (fn: () => Promise<void>) => {
		setSavingSettings(true);
		setSettingsError("");
		setSettingsNotice("");

		try {
			await fn();
			setSettingsDirty(false);
		} catch (e) {
			setSettingsError((e as Error).message);
		} finally {
			setSavingSettings(false);
		}
	};

	const feedback = (scope: string) =>
		feedbackScope === scope && (
			<>
				{error && !clearing && (
					<Feedback
						focusOnMount
						title="Action could not be completed"
					>
						{error}
					</Feedback>
				)}
				{notice && <Feedback tone="success">{notice}</Feedback>}
			</>
		);

	if (!allowed)
		return (
			<div className={s.page}>
				<h1>Administration</h1>
				<p>Administrator or moderator access is required.</p>
			</div>
		);

	return (
		<div className={s.page}>
			<div className={s.pageHeader}>
				<div>
					<h1>Administration</h1>
					<p className={f.hint}>
						Manage access, calendar limits, and instance activity.
					</p>
				</div>
			</div>
			<div className={s.workspace} data-detail={mobileDetail}>
				<nav
					className={s.navigation}
					aria-label="Administration sections"
				>
					{(Object.entries(sections) as [Section, string][])
						.filter(
							([key]) =>
								user?.isAdmin ||
								!["instance-settings", "invitations"].includes(
									key,
								),
						)
						.map(([key, label]) => (
							<button
								key={key}
								type="button"
								aria-current={
									section === key ? "page" : undefined
								}
								onClick={() => chooseSection(key)}
							>
								{label}
								<span aria-hidden="true">›</span>
							</button>
						))}
				</nav>
				<div
					className={s.content}
					ref={sectionContent}
					tabIndex={-1}
					aria-label={sections[section]}
				>
					<button
						className={`${f.textButton} ${s.mobileBack}`}
						onClick={() => setMobileDetail(false)}
					>
						← Administration
					</button>
					{sectionError && (
						<Feedback title="Could not load this section">
							{sectionError}
							<button
								className={f.button}
								onClick={() => setRetry((old) => old + 1)}
							>
								Try again
							</button>
						</Feedback>
					)}
					{sectionLoading && (
						<p role="status">
							Loading {sections[section].toLowerCase()}…
						</p>
					)}

					{section === "activity" && feedback("activity")}
					<section
						className={s.section}
						id="activity"
						hidden={section !== "activity"}
					>
						<div className={s.sectionHeader}>
							<h2>Instance activity</h2>
							<button
								className={f.button}
								disabled={busy}
								onClick={() =>
									void action(async () => {
										setStats(await adminApi.stats());
									})
								}
							>
								Refresh activity
							</button>
						</div>
						{stats ? (
							<dl className={s.stats}>
								{Object.entries({
									Users: stats.users,
									Calendars: stats.calendars,
									Events: stats.events,
									Connections: stats.connections,
									"Queued or running syncs":
										stats.activeSyncs,
									"Failed syncs · last 24 hours":
										stats.failedSyncsToday,
								}).map(([label, value]) => (
									<div key={label}>
										<dt>{label}</dt>
										<dd>{value.toLocaleString()}</dd>
									</div>
								))}
							</dl>
						) : (
							<p>Loading activity…</p>
						)}
					</section>
					{settings && user?.isAdmin && (
						<section
							className={s.section}
							id="instance-settings"
							hidden={section !== "instance-settings"}
						>
							<h2>Instance settings</h2>
							<form
								className={f.stack}
								onChange={() => {
									setSettingsDirty(true);
									setSettingsNotice("");
								}}
								onSubmit={(e) => {
									e.preventDefault();

									void settingsAction(async () => {
										setSettings(
											await adminApi
												.saveSettings({
													registrationsOpen:
														settings.registrationsOpen,
													inviteOnly:
														settings.inviteOnly,
													requireTwoFactor:
														settings.requireTwoFactor,
													requireEmailVerification:
														settings.requireEmailVerification,
													maxCalendarsPerUser:
														settings.maxCalendarsPerUser,
													minSyncIntervalMinutes:
														settings.minSyncIntervalMinutes,
													syncConcurrency:
														settings.syncConcurrency,
													syncPastDays:
														settings.syncPastDays,
													syncFutureDays:
														settings.syncFutureDays,
													defaultTimezone:
														settings.defaultTimezone,
													defaultFirstDayOfWeek:
														settings.defaultFirstDayOfWeek,
												})
												.then((saved) => ({
													...saved,
													smtpConfigured:
														settings.smtpConfigured,
												})),
										);

										setSettingsNotice(
											"Instance settings saved.",
										);
									});
								}}
							>
								<fieldset
									className={f.stack}
									disabled={savingSettings}
								>
									<div className={s.settingsGroup}>
										<div className={s.groupIntro}>
											<h3>Account access</h3>
											<p>
												Choose who can join and how they
												secure their account.
											</p>
										</div>
										<div className={s.groupFields}>
											<label className={f.row}>
												<input
													type="checkbox"
													checked={
														settings.requireTwoFactor
													}
													onChange={(e) =>
														setSettings({
															...settings,
															requireTwoFactor:
																e.target
																	.checked,
														})
													}
												/>
												Require two-factor
												authentication
											</label>
											<p className={f.hint}>
												Requires verified email for
												every account. Verified users
												without a factor will use email
												codes; others must complete
												setup. Existing authenticator
												methods stay active.
											</p>
											<label className={f.row}>
												<input
													type="checkbox"
													checked={
														settings.registrationsOpen
													}
													onChange={(e) =>
														setSettings({
															...settings,
															registrationsOpen:
																e.target
																	.checked,
														})
													}
												/>
												Allow new registrations
											</label>
											<label className={f.row}>
												<input
													type="checkbox"
													checked={
														settings.inviteOnly
													}
													onChange={(e) =>
														setSettings({
															...settings,
															inviteOnly:
																e.target
																	.checked,
														})
													}
												/>
												Require an invitation
											</label>
											<label className={f.row}>
												<input
													type="checkbox"
													checked={
														settings.requireEmailVerification
													}
													onChange={(e) =>
														setSettings({
															...settings,
															requireEmailVerification:
																e.target
																	.checked,
														})
													}
												/>
												Require verified email
											</label>
											<p className={f.hint}>
												{settings.smtpConfigured
													? "SMTP is configured. When verification is required, new users receive a verification link by email. Unverified users can sign in and resend the email; calendars and sharing remain restricted when verification is required."
													: "Configure SMTP_HOST and SMTP_FROM in the server environment before requiring verification. SMTP credentials stay on the server."}{" "}
												Administrators retain access.
											</p>
										</div>
									</div>
									<div className={s.settingsGroup}>
										<div className={s.groupIntro}>
											<h3>Calendars & synchronization</h3>
											<p>
												Set account limits and the range
												of events to keep.
											</p>
										</div>
										<div className={s.groupFields}>
											<div className={f.row}>
												<label className={f.field}>
													Maximum calendars per user
													<input
														className={f.input}
														type="number"
														min={1}
														max={1000}
														required
														value={
															settings.maxCalendarsPerUser
														}
														onChange={(e) =>
															setSettings({
																...settings,
																maxCalendarsPerUser:
																	Number(
																		e.target
																			.value,
																	),
															})
														}
													/>
												</label>
												<label className={f.field}>
													Minimum sync interval
													(minutes)
													<input
														className={f.input}
														type="number"
														min={1}
														max={10080}
														required
														value={
															settings.minSyncIntervalMinutes
														}
														onChange={(e) =>
															setSettings({
																...settings,
																minSyncIntervalMinutes:
																	Number(
																		e.target
																			.value,
																	),
															})
														}
													/>
												</label>
												<label className={f.field}>
													Concurrent sync jobs
													<input
														className={f.input}
														type="number"
														min={1}
														max={16}
														step={1}
														required
														value={
															settings.syncConcurrency
														}
														onChange={(e) =>
															setSettings({
																...settings,
																syncConcurrency:
																	Number(
																		e.target
																			.value,
																	),
															})
														}
													/>
												</label>
											</div>
											<p className={f.hint}>
												Sync changes apply on the next
												scheduler tick. Manual-only
												calendars keep interval 0.
												Existing calendars above the
												calendar limit remain available.
											</p>
											<div className={f.row}>
												{(
													[
														[
															"syncPastDays",
															"Sync past days",
														],
														[
															"syncFutureDays",
															"Sync future days",
														],
													] as const
												).map(([key, label]) => (
													<label
														key={key}
														className={f.field}
													>
														{label}
														<input
															className={f.input}
															type="number"
															min={0}
															max={3650}
															required
															value={
																settings[key]
															}
															onChange={(e) =>
																setSettings({
																	...settings,
																	[key]: Number(
																		e.target
																			.value,
																	),
																})
															}
														/>
													</label>
												))}
											</div>
											<p className={f.hint}>
												The next successful sync removes
												events outside this rolling
												window. Failed syncs preserve
												existing events. Manual-only
												calendars wait for a manual
												sync.
											</p>
										</div>
									</div>
									<div className={s.settingsGroup}>
										<div className={s.groupIntro}>
											<h3>Default preferences</h3>
											<p>
												A starting point for new
												accounts.
											</p>
										</div>
										<div className={s.groupFields}>
											<div className={f.row}>
												<label className={f.field}>
													Default timezone
													<select
														className={f.select}
														value={
															settings.defaultTimezone
														}
														onChange={(e) =>
															setSettings({
																...settings,
																defaultTimezone:
																	e.target
																		.value,
															})
														}
													>
														{[
															...new Set([
																"UTC",
																settings.defaultTimezone,
																...((
																	Intl as typeof Intl & {
																		supportedValuesOf?: (
																			key: string,
																		) => string[];
																	}
																).supportedValuesOf?.(
																	"timeZone",
																) || [
																	"Europe/Berlin",
																	"America/New_York",
																]),
															]),
														].map((zone) => (
															<option key={zone}>
																{zone}
															</option>
														))}
													</select>
												</label>
												<label className={f.field}>
													Default first day of the
													week
													<select
														className={f.select}
														value={
															settings.defaultFirstDayOfWeek
														}
														onChange={(e) =>
															setSettings({
																...settings,
																defaultFirstDayOfWeek:
																	e.target
																		.value as
																		| "monday"
																		| "sunday",
															})
														}
													>
														<option value="monday">
															Monday
														</option>
														<option value="sunday">
															Sunday
														</option>
													</select>
												</label>
											</div>
											<p className={f.hint}>
												Defaults apply to new accounts
												and accounts without saved
												preferences. Existing
												preferences stay unchanged.
											</p>
										</div>
									</div>
									<div className={s.saveArea}>
										{settingsError && (
											<Feedback
												focusOnMount
												title="Settings were not saved"
											>
												<p>{settingsError}</p>
												<p>
													Your changes are still here.
													Correct the issue and try
													again.
												</p>
											</Feedback>
										)}
										{settingsNotice && (
											<Feedback tone="success">
												{settingsNotice}
											</Feedback>
										)}
										{settingsDirty &&
											!settingsError &&
											!settingsNotice && (
												<span className={s.unsaved}>
													Unsaved changes
												</span>
											)}
										<button
											className={`${f.button} ${f.primary}`}
											disabled={savingSettings}
										>
											{savingSettings
												? "Saving settings…"
												: "Save settings"}
										</button>
									</div>
								</fieldset>
							</form>
						</section>
					)}
					<section
						className={s.section}
						id="users"
						hidden={section !== "users"}
					>
						<h2>Users</h2>
						{feedback("users")}
						<p className={f.hint}>
							Moderators can review users and sync activity.
							Administrators manage settings and accounts.
							Read-only demo accounts can browse but cannot change
							data.
						</p>
						<form
							className={s.filterBar}
							onSubmit={(e) => {
								e.preventDefault();
								void action(() => loadUsers(), "users");
							}}
						>
							<label className={f.field}>
								Search users
								<input
									className={f.input}
									value={query}
									maxLength={100}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Name or email"
								/>
							</label>
							<button className={f.button} disabled={busy}>
								Search
							</button>
						</form>
						<div
							className={s.tableScroll}
							tabIndex={0}
							role="region"
							aria-label="Users"
						>
							<table className={s.table}>
								<thead>
									<tr>
										<th>User</th>
										<th>Role</th>
										<th>Status</th>
										<th>Calendars</th>
										{user?.isAdmin && <th>Manage</th>}
									</tr>
								</thead>
								<tbody>
									{users?.items.map((row) => (
										<tr key={row.id}>
											<td data-label="User">
												{row.name || row.email}
												<div className={s.meta}>
													{row.email}
												</div>
											</td>
											<td data-label="Role">
												{roleLabels[row.accountRole]}
											</td>
											<td data-label="Status">
												{row.disabled
													? "Disabled"
													: "Active"}
												<div className={s.meta}>
													{row.emailVerifiedAt
														? "Email verified"
														: "Email unverified"}
												</div>
											</td>
											<td data-label="Calendars">
												{row.calendarCount}
											</td>
											{user?.isAdmin && (
												<td data-label="Manage">
													<button
														className={f.button}
														onClick={() => {
															setEditing(row);
															setResetNotice("");
															setEditError("");
														}}
													>
														Manage
													</button>
												</td>
											)}
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{users && !users.items.length && (
							<p>No users match this search.</p>
						)}
						{users?.nextCursor && (
							<button
								className={f.button}
								disabled={busy}
								onClick={() =>
									void action(
										() => loadUsers(users.nextCursor!),
										"users",
									)
								}
							>
								More users
							</button>
						)}
					</section>
					<section
						className={s.section}
						id="sync-logs"
						hidden={section !== "sync-logs"}
					>
						<div className={s.sectionHeader}>
							<h2>Synchronization log</h2>
							{user?.isAdmin && (
								<button
									className={f.button}
									disabled={busy}
									onClick={() => {
										setError("");
										setClearing(true);
									}}
								>
									Clear all sync logs
								</button>
							)}
						</div>
						{feedback("logs")}
						<form
							className={s.filterBar}
							onSubmit={(e) => {
								e.preventDefault();
								void action(() => loadLogs(), "logs");
							}}
						>
							<label className={f.field}>
								Status
								<select
									className={f.select}
									value={status}
									onChange={(e) =>
										setStatus(
											e.target.value as typeof status,
										)
									}
								>
									<option value="">All statuses</option>
									{[
										"queued",
										"running",
										"succeeded",
										"failed",
									].map((value) => (
										<option key={value}>{value}</option>
									))}
								</select>
							</label>
							<button className={f.button} disabled={busy}>
								Apply filter
							</button>
						</form>
						<div
							className={s.tableScroll}
							tabIndex={0}
							role="region"
							aria-label="Synchronization log"
						>
							<table className={s.table}>
								<thead>
									<tr>
										<th>Calendar</th>
										<th>Status</th>
										<th>Submitted</th>
										<th>Finished</th>
										<th>Events</th>
									</tr>
								</thead>
								<tbody>
									{logs?.items.map((row) => (
										<tr key={row.id}>
											<td data-label="Calendar">
												{row.calendarName}
												<div className={s.meta}>
													{row.ownerEmail}
												</div>
											</td>
											<td data-label="Status">
												{row.status}
												{row.error && (
													<div className={s.meta}>
														{row.error}
													</div>
												)}
											</td>
											<td data-label="Submitted">
												{new Date(
													row.createdAt,
												).toLocaleString()}
											</td>
											<td data-label="Finished">
												{row.finishedAt
													? new Date(
															row.finishedAt,
														).toLocaleString()
													: "—"}
											</td>
											<td data-label="Events">
												{row.eventsSynced ?? "—"}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
						{logs && !logs.items.length && (
							<p>No sync runs match this filter.</p>
						)}
						{logs?.nextCursor && (
							<button
								className={f.button}
								disabled={busy}
								onClick={() =>
									void action(
										() => loadLogs(logs.nextCursor!),
										"logs",
									)
								}
							>
								More sync runs
							</button>
						)}
					</section>
					<div hidden={section !== "email-jobs"}>
						{visited["email-jobs"] && (
							<EmailJobs administrator={!!user?.isAdmin} />
						)}
					</div>
					<div hidden={section !== "invitations"}>
						{user?.isAdmin && visited.invitations && (
							<Invitations />
						)}
					</div>
				</div>
			</div>
			{clearing && (
				<Modal
					isOpen
					title="Clear all sync logs"
					onClose={() => setClearing(false)}
				>
					<div className={f.stack}>
						<p>
							This deletes completed sync history and clears
							calendar error messages. Queued and running jobs,
							and last successful sync times, are preserved.
							Failure statistics will reflect the remaining
							history.
						</p>
						{error && <Feedback focusOnMount>{error}</Feedback>}
						<button
							className={`${f.button} ${f.danger}`}
							disabled={busy}
							onClick={() =>
								void action(async () => {
									const result = await adminApi.clearLogs();
									await loadLogs();
									setStats(await adminApi.stats());
									setClearing(false);

									setNotice(
										`Cleared ${result.deletedLogs} logs and ${result.clearedErrors} calendar errors.`,
									);
								}, "logs")
							}
						>
							{busy ? "Clearing…" : "Clear history and errors"}
						</button>
						<button
							className={f.button}
							onClick={() => setClearing(false)}
						>
							Cancel
						</button>
					</div>
				</Modal>
			)}

			{editing && (
				<Modal
					isOpen
					title={`Manage ${editing.name || editing.email}`}
					onClose={() => setEditing(null)}
				>
					<form
						className={f.stack}
						onSubmit={async (e) => {
							e.preventDefault();
							setBusy(true);
							setEditError("");

							try {
								await adminApi.updateUser(editing.id, {
									accountRole: editing.accountRole,
									disabled: editing.disabled,
									emailVerified: !!editing.emailVerifiedAt,
								});

								const self = editing.id === user?.id;
								setEditing(null);

								try {
									await loadUsers();
									if (self) await refresh();
								} catch {
									setFeedbackScope("users");

									setError(
										"User saved, but the list could not refresh. Reload the page to see the changes.",
									);
								}
							} catch (e) {
								setEditError((e as Error).message);
							} finally {
								setBusy(false);
							}
						}}
					>
						<label className={f.field}>
							Role
							<select
								className={f.select}
								value={editing.accountRole}
								onChange={(e) =>
									setEditing({
										...editing,
										accountRole: e.target
											.value as User["accountRole"],
									})
								}
							>
								{Object.entries(roleLabels).map(
									([key, label]) => (
										<option value={key} key={key}>
											{label}
										</option>
									),
								)}
							</select>
						</label>
						<label className={f.row}>
							<input
								type="checkbox"
								checked={editing.disabled}
								onChange={(e) =>
									setEditing({
										...editing,
										disabled: e.target.checked,
									})
								}
							/>
							Disable account
						</label>
						<label className={f.row}>
							<input
								type="checkbox"
								checked={!!editing.emailVerifiedAt}
								onChange={(e) =>
									setEditing({
										...editing,
										emailVerifiedAt: e.target.checked
											? new Date().toISOString()
											: null,
									})
								}
							/>
							Email address verified
						</label>
						<p>
							Role and account changes take effect on existing
							sessions. At least one administrator must remain
							active.
						</p>
						<div className={f.notice}>
							<p>
								Send a reset link to {editing.email}. The user
								chooses their new password; existing sessions
								remain active until it is changed.
							</p>
							<button
								type="button"
								className={f.button}
								disabled={
									resetPending ||
									busy ||
									editing.disabled ||
									editing.accountRole === "readonly"
								}
								onClick={async () => {
									setResetPending(true);
									setEditError("");
									setResetNotice("");

									try {
										await adminApi.resetPassword(
											editing.id,
										);

										setResetNotice(
											"Password reset email requested. Delivery may take a moment.",
										);
									} catch (e) {
										setEditError((e as Error).message);
									} finally {
										setResetPending(false);
									}
								}}
							>
								{" "}
								{resetPending
									? "Requesting…"
									: "Send password reset email"}
							</button>
							{resetNotice && (
								<Feedback
									tone="success"
									title="Reset requested"
								>
									{resetNotice}
								</Feedback>
							)}
						</div>
						<AccountSecurityActions
							account={editing}
							onDeleted={async () => {
								setEditing(null);
								await loadUsers();
								setStats(await adminApi.stats());
							}}
						/>
						{editError && (
							<Feedback focusOnMount>{editError}</Feedback>
						)}
						<button
							className={`${f.button} ${f.primary}`}
							disabled={busy}
						>
							{busy ? "Saving…" : "Save user"}
						</button>
					</form>
				</Modal>
			)}
		</div>
	);
}
