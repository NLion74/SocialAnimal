"use client";

import {
	createContext,
	useContext,
	useEffect,
	useState,
	useRef,
	useCallback,
} from "react";
import { apiClient } from "../../lib/api";
import { accountApi } from "./api";

type User = Awaited<ReturnType<typeof accountApi.me>>;

const SessionContext = createContext<{
	user: User | null;
	loading: boolean;
	error: string;
	refresh: (background?: boolean) => Promise<User | null>;
	logout: () => void;
}>({
	user: null,
	loading: true,
	error: "",
	refresh: async () => null,
	logout: () => {},
});

export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const revision = useRef(0);

	const refresh = useCallback(
		async (background = true): Promise<User | null> => {
			const current = ++revision.current;
			const token = apiClient.getToken();

			if (!background) {
				setLoading(true);
				setError("");
			}

			if (!token) {
				setUser(null);
				setLoading(false);
				return null;
			}

			try {
				const next = await accountApi.me();

				if (
					current !== revision.current ||
					token !== apiClient.getToken()
				)
					return null;

				setUser(next);
				setError("");
				return next;
			} catch (e) {
				if (current === revision.current) {
					if (!apiClient.getToken()) setUser(null);
					else if (!background) setError((e as Error).message);
				}

				throw e;
			} finally {
				if (current === revision.current) setLoading(false);
			}
		},
		[],
	);

	useEffect(() => {
		const reload = () => {
			void refresh(false).catch(() => {});
		};

		const background = () => {
			void refresh(true).catch(() => {});
		};

		reload();
		window.addEventListener("session:changed", reload);
		window.addEventListener("api:logout", reload);
		window.addEventListener("storage", reload);
		window.addEventListener("focus", background);

		return () => {
			++revision.current;
			window.removeEventListener("session:changed", reload);
			window.removeEventListener("api:logout", reload);
			window.removeEventListener("storage", reload);
			window.removeEventListener("focus", background);
		};
	}, [refresh]);

	return (
		<SessionContext
			value={{
				user,
				loading,
				error,
				refresh,
				logout: () => apiClient.setToken(null),
			}}
		>
			{children}
		</SessionContext>
	);
}
