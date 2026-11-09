"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Check, ChevronRight } from "lucide-react";
import Feedback from "../../components/Feedback";
import { useNotifications, notificationCount } from "./NotificationProvider";
import s from "./Notifications.module.css";

export function NotificationBadge({ tab }: { tab?: string }) {
	const { updates, attention } = useNotifications();
	const count = notificationCount(updates, attention, tab);
	return count > 0 ? (
		<span
			className={s.badge}
			id={`notices-${tab || "dashboard"}`}
			aria-label={`${count} ${tab || "dashboard"} notices`}
		>
			{count > 99 ? "99+" : count}
		</span>
	) : null;
}

export default function Notifications() {
	const { updates, attention, error, loading, refresh, read } =
		useNotifications();
	const [actionError, setActionError] = useState("");
	const [pending, setPending] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
	const recent = updates.filter((item) => !item.active);

	return (
		<section className={s.panel} aria-label="Notifications">
			<div className={s.heading}>
				<h2>
					<Bell size={18} /> Notifications
				</h2>
				<button onClick={() => void refresh()} className={s.textButton}>
					Refresh
				</button>
			</div>
			{(error || actionError) && (
				<Feedback title="Notifications could not be updated">
					{actionError || error}
				</Feedback>
			)}
			{loading && (
				<p role="status" className={s.muted}>
					Loading notifications…
				</p>
			)}
			{!!attention.length && (
				<div className={s.section}>
					<h3>
						Needs attention <span>{attention.length}</span>
					</h3>
					<ul className={s.list}>
						{attention.map((item) => (
							<li key={item.id}>
								<Link href={item.href} className={s.row}>
									<span
										className={s.dot}
										aria-hidden="true"
									/>
									<span>{item.title}</span>
									<ChevronRight size={16} />
								</Link>
							</li>
						))}
					</ul>
				</div>
			)}
			{!!recent.length && (
				<div className={s.section}>
					<h3>Recent updates</h3>
					<ul className={s.list}>
						{(expanded ? recent : recent.slice(0, 5)).map(
							(item) => (
								<li key={item.id} className={s.update}>
									<Link href={item.href} className={s.row}>
										<span
											className={
												item.readAt ? s.readDot : s.dot
											}
											aria-label={
												item.readAt ? "Read" : "Unread"
											}
										/>
										<span>
											{item.title}
											<small>
												{new Date(
													item.createdAt,
												).toLocaleString()}
											</small>
										</span>
										<ChevronRight size={16} />
									</Link>
									{!item.readAt && (
										<button
											className={s.readButton}
											aria-label={`Mark read: ${item.title}`}
											disabled={pending === item.id}
											onClick={async () => {
												setPending(item.id);
												setActionError("");
												try {
													await read(item.id);
												} catch (e) {
													setActionError(
														(e as Error).message,
													);
												} finally {
													setPending(null);
												}
											}}
										>
											<Check size={16} />
											<span>Mark read</span>
										</button>
									)}
								</li>
							),
						)}
					</ul>
					{recent.length > 5 && (
						<button
							className={s.textButton}
							onClick={() => setExpanded(!expanded)}
						>
							{expanded
								? "Show fewer"
								: `Show all ${recent.length} updates`}
						</button>
					)}
				</div>
			)}
			{!loading && !error && !attention.length && !recent.length && (
				<p className={s.muted}>
					You’re all caught up. Friend requests and highlighted events
					will appear here.
				</p>
			)}
		</section>
	);
}
