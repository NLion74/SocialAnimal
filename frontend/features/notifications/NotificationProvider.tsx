"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
	useRef,
} from "react";
import { useSession } from "../account/SessionProvider";
import { notificationsApi } from "./api";

type Updates = Awaited<ReturnType<typeof notificationsApi.list>>;
type Attention = Awaited<
	ReturnType<typeof notificationsApi.attention>
>["items"];
const Context = createContext({
	updates: [] as Updates,
	attention: [] as Attention,
	error: "",
	loading: true,
	refresh: async () => {},
	read: async (_id: string) => {},
});

export function NotificationProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { user } = useSession();
	const [updates, setUpdates] = useState<Updates>([]);
	const [attention, setAttention] = useState<Attention>([]);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const generation = useRef(0);
	const enabled =
		!!user &&
		!user.securitySetupRequired &&
		!(user.twoFactorRequired && !user.emailVerifiedAt);
	const refresh = useCallback(async () => {
		const current = ++generation.current;
		if (!enabled) return;
		try {
			const [rows, tasks] = await Promise.all([
				notificationsApi.list(),
				notificationsApi.attention(),
			]);
			if (current !== generation.current) return;
			setUpdates(
				rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
			);
			setAttention(tasks.items);
			setError("");
		} catch (e) {
			if (current === generation.current) setError((e as Error).message);
		} finally {
			if (current === generation.current) setLoading(false);
		}
	}, [enabled, user?.id, user?.emailVerifiedAt]);

	useEffect(() => {
		setUpdates([]);
		setAttention([]);
		void refresh();
		const reload = () => {
			if (document.visibilityState === "visible") void refresh();
		};
		const timer = setInterval(reload, 30000);
		window.addEventListener("focus", reload);
		window.addEventListener("data:changed", reload);
		document.addEventListener("visibilitychange", reload);
		return () => {
			generation.current++;
			clearInterval(timer);
			window.removeEventListener("focus", reload);
			window.removeEventListener("data:changed", reload);
			document.removeEventListener("visibilitychange", reload);
		};
	}, [refresh]);

	return (
		<Context.Provider
			value={{
				updates,
				attention,
				error,
				loading,
				refresh,
				read: async (id) => {
					await notificationsApi.read(id);
					await refresh();
				},
			}}
		>
			{children}
		</Context.Provider>
	);
}

export const useNotifications = () => useContext(Context);

export function notificationCount(
	updates: Updates,
	attention: Attention,
	tab?: string,
) {
	// Active notices live in attention only. Reading an update cannot resolve a task.
	return (
		attention.filter((item) => !tab || item.tab === tab).length +
		updates.filter(
			(item) =>
				!item.active && !item.readAt && (!tab || item.tab === tab),
		).length
	);
}
