"use client";

import Feedback from "../../components/Feedback";

import { useState, useEffect, useCallback } from "react";
import { UserPlus, X, Check, Users, Share2 } from "lucide-react";
import s from "./Friends.module.css";
import { apiClient } from "../../lib/api";
import { calendarsApi } from "../calendars/api";
import { friendsApi } from "../friends/api";
import ShareRules from "../permissions/ShareRules";
import { useSession } from "../account/SessionProvider";
import type { Friend, CalendarData } from "../../lib/types";
import Modal from "../../components/Modal";

export default function FriendsPage() {
	const { user } = useSession();
	const [friends, setFriends] = useState<Friend[]>([]);
	const [calendars, setCalendars] = useState<CalendarData[]>([]);
	const [loading, setLoading] = useState(true);
	const [showAdd, setShowAdd] = useState(false);

	const [emailInput, setEmailInput] = useState(""); // remove when uncommenting search
	const [addErr, setAddErr] = useState("");
	const [adding, setAdding] = useState(false);
	const [loadError, setLoadError] = useState("");
	const [notice, setNotice] = useState("");
	const [pendingAction, setPendingAction] = useState<string | null>(null);

	const [actionError, setActionError] = useState<{
		id: string;
		message: string;
	} | null>(null);

	const [shareTarget, setShareTarget] = useState<Friend | null>(null);

	const uid = apiClient.getUid();

	const load = useCallback(async () => {
		setLoading(true);
		setLoadError("");

		try {
			const [fr, cr] = await Promise.all([
				friendsApi.list(),
				calendarsApi.list(),
			]);

			setFriends(fr);
			setCalendars(cr);

			setShareTarget((prev) =>
				prev ? (fr.find((f) => f.id === prev.id) ?? null) : null,
			);
		} catch (e) {
			setLoadError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const getFriend = (f: Friend) => (f.user1.id === uid ? f.user2 : f.user1);

	const isIncoming = (f: Friend) =>
		f.status === "pending" && f.user2.id === uid;

	const closeAddModal = () => {
		setShowAdd(false);
		setEmailInput("");
		setAddErr("");
	};

	const sendRequest = async () => {
		const trimmed = emailInput.trim();
		if (!trimmed) return;
		setAdding(true);
		setAddErr("");

		try {
			await friendsApi.request({
				identifier: trimmed,
			});

			closeAddModal();
			setNotice("Friend request sent.");
			void load();
		} catch (e: any) {
			setAddErr(e.message);
		} finally {
			setAdding(false);
		}
	};

	const changeFriendship = async (
		id: string,
		operation: () => Promise<unknown>,
	) => {
		setPendingAction(id);
		setActionError(null);
		setNotice("");

		try {
			await operation();
			await load();
		} catch (e) {
			setActionError({ id, message: (e as Error).message });
		} finally {
			setPendingAction(null);
		}
	};

	const accept = (id: string) =>
		changeFriendship(id, () => friendsApi.accept(id));

	const remove = (id: string) => {
		if (!confirm("Remove this friend or request?")) return;
		return changeFriendship(id, () => friendsApi.remove(id));
	};

	if (loading && !shareTarget)
		return (
			<div className={s.loading}>
				<div className={s.spinner} />
				<span>Loading…</span>
			</div>
		);

	const accepted = friends.filter((f) => f.status === "accepted");
	const pending = friends.filter((f) => f.status === "pending");

	return (
		<div className={s.page}>
			<div className={s.pageHeader}>
				<h1 className={s.pageTitle}>Friends</h1>
				<button
					className={`${s.btn} ${s.btnPrimary}`}
					onClick={() => {
						setAddErr("");
						setShowAdd(true);
					}}
				>
					<UserPlus size={14} /> Add Friend
				</button>
			</div>

			{loadError && (
				<Feedback title="Could not load friends">
					{loadError}
					<button className={s.btn} onClick={() => void load()}>
						Try again
					</button>
				</Feedback>
			)}
			{notice && <Feedback tone="success">{notice}</Feedback>}
			<div className={s.section}>
				<div className={s.sectionTitle}>
					Friends ({accepted.length})
				</div>
				{loadError && !friends.length ? (
					<p>Try again to load your friends.</p>
				) : accepted.length === 0 ? (
					<div className={s.empty}>
						<Users size={36} className={s.emptyIcon} />
						<span>No friends yet</span>
					</div>
				) : (
					<div className={s.list}>
						{accepted.map((f) => {
							const friend = getFriend(f);

							return (
								<div key={f.id} className={s.row}>
									{actionError?.id === f.id && (
										<Feedback
											focusOnMount
											title="Friendship was not changed"
										>
											{actionError.message}
										</Feedback>
									)}
									<div className={s.rowInfo}>
										<div className={s.rowName}>
											{friend.name || friend.email}
										</div>
										<div className={s.rowEmail}>
											{friend.email}
										</div>
										{(f.sharedCalendarIds ?? []).length >
											0 && (
											<div className={s.rowMeta}>
												<span
													className={`${s.badge} ${s.badgeGreen}`}
												>
													{
														(
															f.sharedCalendarIds ??
															[]
														).length
													}{" "}
													shared
												</span>
											</div>
										)}
									</div>
									<div className={s.rowActions}>
										<button
											className={`${s.btn} ${s.btnSecondary} ${s.btnSm}`}
											onClick={() => setShareTarget(f)}
										>
											<Share2 size={12} /> Share
										</button>
										<button
											className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
											disabled={pendingAction !== null}
											onClick={() => void remove(f.id)}
										>
											Remove
										</button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{pending.length > 0 && (
				<div className={s.section}>
					<div className={s.sectionTitle}>Pending Requests</div>
					<div className={s.list}>
						{pending.map((f) => {
							const friend = getFriend(f);

							return (
								<div key={f.id} className={s.row}>
									{actionError?.id === f.id && (
										<Feedback
											focusOnMount
											title="Friendship was not changed"
										>
											{actionError.message}
										</Feedback>
									)}
									<div className={s.rowInfo}>
										<div className={s.rowName}>
											{friend.name || friend.email}
										</div>
										<div className={s.rowEmail}>
											{friend.email}
										</div>
									</div>
									<div className={s.rowActions}>
										{isIncoming(f) ? (
											<>
												<button
													className={`${s.btn} ${s.btnSuccess} ${s.btnSm}`}
													disabled={
														pendingAction !== null
													}
													onClick={() =>
														void accept(f.id)
													}
												>
													<Check size={12} /> Accept
												</button>
												<button
													className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
													disabled={
														pendingAction !== null
													}
													onClick={() =>
														void remove(f.id)
													}
												>
													<X size={12} /> Decline
												</button>
											</>
										) : (
											<>
												<span
													className={`${s.badge} ${s.badgeMuted}`}
												>
													Sent
												</span>
												<button
													className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
													disabled={
														pendingAction !== null
													}
													onClick={() =>
														void remove(f.id)
													}
												>
													Remove
												</button>
											</>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			<Modal isOpen={showAdd} onClose={closeAddModal} title="Add Friend">
				<div className={s.formStack}>
					<div>
						<label
							className={s.fieldLabel}
							htmlFor="friend-email-input"
						>
							Friend's Email
						</label>
						<input
							id="friend-email-input"
							className={s.input}
							type="email"
							value={emailInput}
							onChange={(e) => {
								setEmailInput(e.target.value);
								setAddErr("");
							}}
							placeholder="Enter email address"
							onKeyDown={(e) =>
								e.key === "Enter" &&
								emailInput.trim() &&
								sendRequest()
							}
							autoFocus
						/>
					</div>
					{addErr && <Feedback focusOnMount>{addErr}</Feedback>}
					<div className={s.formRow}>
						<button
							className={`${s.btn} ${s.btnPrimary}`}
							style={{ flex: 1 }}
							onClick={sendRequest}
							disabled={adding || !emailInput.trim()}
						>
							{adding ? "Sending…" : "Send Request"}
						</button>
						<button
							className={`${s.btn} ${s.btnSecondary}`}
							onClick={closeAddModal}
						>
							Cancel
						</button>
					</div>
				</div>
			</Modal>

			{shareTarget && (
				<ShareRules
					friend={shareTarget}
					friendId={getFriend(shareTarget).id}
					calendars={calendars}
					readonly={user?.accountRole === "readonly"}
					onClose={() => setShareTarget(null)}
					onChanged={() => void load()}
				/>
			)}
		</div>
	);
}
