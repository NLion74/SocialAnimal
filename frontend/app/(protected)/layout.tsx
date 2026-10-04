"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Calendar, Users, Home, User, LogOut, Shield } from "lucide-react";
import { useSession } from "../../features/account/SessionProvider";
import VerificationNotice from "../../features/account/VerificationNotice";
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
	};

	if (error)
		return (
			<div className={s.errorState} role="alert">
				{error}
				<button
					className={s.logoutBtn}
					onClick={() => {
						void refresh(false).catch(() => {});
					}}
				>
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

	if (
		user.securitySetupRequired ||
		(user.twoFactorRequired && !user.emailVerifiedAt)
	)
		return (
			<main className={s.main}>
				<h1>Complete account security</h1>
				<p>
					{user.emailVerifiedAt
						? "Sign in again to confirm your second factor and continue."
						: "Verify your email to finish setup. Then sign in again to confirm your second factor."}
				</p>
				<VerificationNotice />
				<button className={s.logoutBtn} onClick={handleLogout}>
					Sign out and sign in again
				</button>
			</main>
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
				{[
					...TABS,
					...(user.isAdmin || user.accountRole === "moderator"
						? [{ id: "/admin", label: "Admin", icon: Shield }]
						: []),
				].map(({ id, label, icon: Icon }) => (
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

			<main className={s.main}>
				{user.accountRole === "readonly" && (
					<p role="status" className={s.accountNotice}>
						Demo account · browsing only. Changes are disabled.
					</p>
				)}
				{user.verificationRequired &&
				!user.emailVerifiedAt &&
				!user.isAdmin &&
				pathname !== "/profile" ? (
					<VerificationNotice />
				) : (
					<>
						{pathname === "/profile" && !user.emailVerifiedAt && (
							<VerificationNotice />
						)}
						{children}
					</>
				)}
			</main>
		</div>
	);
}
