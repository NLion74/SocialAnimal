"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Calendar, Users, Home, User, LogOut } from "lucide-react";
import { apiClient } from "../../lib/api";
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
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/");
            return;
        }

        apiClient
            .get("/api/users/me")
            .then(setUser)
            .catch(() => router.push("/"));
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem("token");
        router.push("/");
    };

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
                <div className={s.brand}>
                    <div className={s.brandIcon}>
                        <Calendar size={15} color="var(--purple-400)" />
                    </div>
                    <span className={s.brandName}>SocialAnimal</span>
                </div>
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
