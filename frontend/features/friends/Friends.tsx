"use client";

import Feedback from "../../components/Feedback";

import { useState, useEffect, useCallback, useRef } from "react";
import {
	UserPlus,
	X,
	Check,
	Users,
	ChevronRight,
	UserMinus,
} from "lucide-react";
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
	const [removeTarget, setRemoveTarget] = useState<Friend | null>(null);

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
	const [search, setSearch] = useState("");
	const leaveDetail = useRef<() => boolean>(() => true);
	const setGuard = useCallback((guard: () => boolean) => {
		leaveDetail.current = guard;
	}, []);
	const selectFriend = (friend: Friend | null) => {
		if (leaveDetail.current()) setShareTarget(friend);
	};

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
			return true;
		} catch (e) {
			setActionError({ id, message: (e as Error).message });
			return false;
		} finally {
			setPendingAction(null);
		}
	};

	const accept = (id: string) =>
		changeFriendship(id, () => friendsApi.accept(id));

	const remove = (id: string) => {
		setActionError(null);
		setRemoveTarget(friends.find((friend) => friend.id === id) || null);
	};

	if (loading && !shareTarget && !friends.length && !removeTarget)
		return (
			<div className={s.loading}>
				<div className={s.spinner} />
				<span>Loading…</span>
			</div>
		);

	const accepted = friends.filter((f) => f.status === "accepted");
	const pending = friends.filter((f) => f.status === "pending");
	const matches = accepted.filter((f) =>
		`${getFriend(f).name || ""} ${getFriend(f).email}`
			.toLowerCase()
			.includes(search.trim().toLowerCase()),
	);
	const removalLabel =
		removeTarget?.status === "accepted"
			? "Remove friend"
			: removeTarget && isIncoming(removeTarget)
				? "Decline request"
				: "Cancel request";

	return (
		<div className={s.page} data-detail={!!shareTarget}>
			<div className={s.pageHeader}>
				<div>
					<h1 className={s.pageTitle}>Friends</h1>
					<p className={s.subtitle}>
						Choose what each friend can see in your calendars.
					</p>
				</div>
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
			<div className={s.workspace} data-selected={!!shareTarget}>
				<div className={s.friendList}>
					<div className={s.section}>
						<div className={s.sectionTitle}>
							Friends ({accepted.length})
						</div>
						<label className={s.searchField}>
							Find a friend
							<input
								className={s.input}
								type="search"
								value={search}
								onChange={(event) =>
									setSearch(event.target.value)
								}
								placeholder="Name or email"
							/>
						</label>
						{loadError && !friends.length ? (
							<p>Try again to load your friends.</p>
						) : accepted.length === 0 ? (
							<div className={s.empty}>
								<Users size={36} className={s.emptyIcon} />
								<span>No friends yet</span>
							</div>
						) : (
							<div className={s.list}>
								{!matches.length && (
									<p className={s.emptySearch}>
										No friends match “{search}”. Try another
										name or email.
									</p>
								)}
								{matches.map((f) => {
									const friend = getFriend(f);
									const shared = (
										f.sharedCalendarIds || []
									).filter((id) => {
										const expiresAt =
											f.sharedCalendarExpirations?.[id];
										return (
											!expiresAt ||
											new Date(expiresAt) > new Date()
										);
									}).length;

									return (
										<button
											key={f.id}
											className={s.friendChoice}
											aria-pressed={
												shareTarget?.id === f.id
											}
											onClick={() => selectFriend(f)}
										>
											<span
												className={s.avatar}
												aria-hidden="true"
											>
												{(friend.name || friend.email)
													.slice(0, 1)
													.toUpperCase()}
											</span>
											<span className={s.rowInfo}>
												<strong className={s.rowName}>
													{friend.name ||
														friend.email}
												</strong>
												<span className={s.rowEmail}>
													{friend.email}
												</span>
												<span className={s.rowMeta}>
													<span>
														You share {shared}{" "}
														{shared === 1
															? "calendar"
															: "calendars"}
													</span>
													<span>
														They share{" "}
														{f.sharedWithMe
															?.length || 0}{" "}
														{f.sharedWithMe
															?.length === 1
															? "calendar"
															: "calendars"}
													</span>
												</span>
											</span>
											<ChevronRight
												size={18}
												aria-hidden="true"
											/>
										</button>
									);
								})}
							</div>
						)}
					</div>

					{pending.length > 0 && (
						<div className={s.section}>
							<div className={s.sectionTitle}>
								Pending Requests
							</div>
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
													{friend.name ||
														friend.email}
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
																pendingAction !==
																null
															}
															onClick={() =>
																void accept(
																	f.id,
																)
															}
														>
															<Check size={12} />{" "}
															Accept
														</button>
														<button
															className={`${s.btn} ${s.btnDanger} ${s.btnSm}`}
															disabled={
																pendingAction !==
																null
															}
															onClick={() =>
																void remove(
																	f.id,
																)
															}
														>
															<X size={12} />{" "}
															Decline
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
																pendingAction !==
																null
															}
															onClick={() =>
																void remove(
																	f.id,
																)
															}
														>
															Cancel request
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
				</div>
				<div className={s.friendDetail}>
					{shareTarget ? (
						<>
							<ShareRules
								key={shareTarget.id}
								friend={shareTarget}
								friendId={getFriend(shareTarget).id}
								calendars={calendars}
								readonly={user?.accountRole === "readonly"}
								onClose={() => selectFriend(null)}
								onGuard={setGuard}
								onChanged={() => void load()}
								actions={
									<button
										type="button"
										className={`${s.btn} ${s.btnRemove}`}
										disabled={
											pendingAction !== null ||
											user?.accountRole === "readonly"
										}
										onClick={() => {
											if (leaveDetail.current())
												remove(shareTarget.id);
										}}
									>
										<UserMinus
											size={16}
											aria-hidden="true"
										/>{" "}
										Remove friend
									</button>
								}
							/>
						</>
					) : (
						<div className={s.detailEmpty}>
							<Users size={32} />
							<h2>Sharing with friends</h2>
							<p>
								Select a friend to manage their calendar access.
							</p>
						</div>
					)}
				</div>
			</div>

			<Modal
				isOpen={!!removeTarget}
				onClose={() => {
					if (!pendingAction) setRemoveTarget(null);
				}}
				title={removalLabel}
				footer={
					<>
						<button
							type="button"
							className={`${s.btn} ${s.btnSecondary}`}
							disabled={!!pendingAction}
							onClick={() => setRemoveTarget(null)}
						>
							Keep{" "}
							{removeTarget?.status === "accepted"
								? "friend"
								: "request"}
						</button>
						<button
							type="button"
							className={`${s.btn} ${s.btnDanger}`}
							disabled={!!pendingAction}
							onClick={async () => {
								if (!removeTarget) return;
								const removed = await changeFriendship(
									removeTarget.id,
									() => friendsApi.remove(removeTarget.id),
								);
								if (removed) {
									setNotice(
										removeTarget.status === "accepted"
											? "Friend removed. Calendar sharing between you has ended."
											: "Friend request removed.",
									);
									setRemoveTarget(null);
								}
							}}
						>
							{pendingAction ? "Removing…" : removalLabel}
						</button>
					</>
				}
			>
				{removeTarget && (
					<div className={s.formStack}>
						<p>
							{removeTarget.status === "accepted" ? (
								<>
									Remove{" "}
									<strong>
										{getFriend(removeTarget).name ||
											getFriend(removeTarget).email}
									</strong>{" "}
									from your friends?
								</>
							) : (
								<>
									This will remove your pending request with{" "}
									<strong>
										{getFriend(removeTarget).name ||
											getFriend(removeTarget).email}
									</strong>
									.
								</>
							)}
						</p>
						{removeTarget.status === "accepted" && (
							<p className={s.subtitle}>
								Calendar sharing between you will end in both
								directions. Your calendars and events will stay.
								You can send a new friend request later.
							</p>
						)}
						{actionError?.id === removeTarget.id && (
							<Feedback
								focusOnMount
								title="Friendship was not changed"
							>
								{actionError.message}
							</Feedback>
						)}
					</div>
				)}
			</Modal>

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
		</div>
	);
}
