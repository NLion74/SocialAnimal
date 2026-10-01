"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Calendar, Users, Home, User, LogOut } from "lucide-react";
import { useSession } from "../../features/account/SessionProvider";
import s from "./layout.module.css";

const TABS = [
	{ id: "/dashboard", label: "Dashboard", icon: Home },
	{ id: "/calendar", label: "Calendar", icon: Calendar },
	{ id: "/friends", label: "Friends", icon: Users },
	{ id: "/profile", label: "Profile", icon: User },
];

export default function ProtectedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const { user, loading, error, logout, refresh } = useSession();

	useEffect(() => {
		if (!loading && !user && !error) router.replace("/login");
	}, [user, loading, error, router]);

	const handleLogout = () => {
		logout();
		router.push("/");
	};

	if (error)
		return (
			<div className={s.errorState} role="alert">
				{error}
				<button className={s.logoutBtn} onClick={refresh}>
					Retry
				</button>
			</div>
		);

	if (!user)
		return (
			<div className={s.loading}>
				<div className={s.spinner} />
				<span>Loading...</span>
			</div>
		);

	return (
		<div className={s.page}>
			<header className={s.header}>
				<Link href="/" className={s.brand}>
					<div className={s.brandIcon}>
						<Image
							src="/favicon.svg"
							alt="SocialAnimal"
							width={15}
							height={15}
						/>
					</div>
					<span className={s.brandName}>SocialAnimal</span>
				</Link>
				<button className={s.logoutBtn} onClick={handleLogout}>
					<LogOut size={13} /> Sign out
				</button>
			</header>

			<div className={s.tabBar}>
				{TABS.map(({ id, label, icon: Icon }) => (
					<Link
						key={id}
						href={id}
						className={`${s.tabBtn} ${pathname === id ? s.active : ""}`}
					>
						<Icon size={14} />
						{label}
					</Link>
				))}
			</div>

			<main className={s.main}>{children}</main>
		</div>
	);
}
