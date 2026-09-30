"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { apiClient } from "../../lib/api";
import { accountApi } from "./api";

type User = Awaited<ReturnType<typeof accountApi.me>>;

const SessionContext = createContext<{
	user: User | null;
	loading: boolean;
	error: string;
	refresh: () => void;
	logout: () => void;
}>({
	user: null,
	loading: true,
	error: "",
	refresh: () => {},
	logout: () => {},
});

export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const refresh = () => {
		setError("");

		if (!apiClient.getToken()) {
			setUser(null);
			setLoading(false);
			return;
		}

		setLoading(true);

		accountApi
			.me()
			.then(setUser)
			.catch((e) => {
				if (!apiClient.getToken()) setUser(null);
				else setError(e.message);
			})
			.finally(() => setLoading(false));
	};

	useEffect(() => {
		refresh();
		window.addEventListener("session:changed", refresh);
		window.addEventListener("api:logout", refresh);
		window.addEventListener("storage", refresh);

		return () => {
			window.removeEventListener("session:changed", refresh);
			window.removeEventListener("api:logout", refresh);
			window.removeEventListener("storage", refresh);
		};
	}, []);

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
