"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Calendar, Users, Home, User, LogOut, Shield } from "lucide-react";
import { apiClient } from "../../lib/api";
import s from "./layout.module.css";

const BASE_TABS = [
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
    const [isAdmin, setIsAdmin] = useState(false);

    const tabs = isAdmin
        ? [...BASE_TABS, { id: "/admin", label: "Admin", icon: Shield }]
        : BASE_TABS;

    useEffect(() => {
        let cancelled = false;

        const withTimeout = async <T,>(
            promise: Promise<T>,
            timeoutMs = 12000,
        ): Promise<T> => {
            return await new Promise<T>((resolve, reject) => {
                const timeout = setTimeout(
                    () => reject(new Error("Request timed out")),
                    timeoutMs,
                );
                promise
                    .then((value) => {
                        clearTimeout(timeout);
                        resolve(value);
                    })
                    .catch((error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
            });
        };

        const loadUser = async (retries = 5) => {
            const token = localStorage.getItem("token");
            if (!token) {
                router.push("/");
                return;
            }
            try {
                const res = await withTimeout(
                    apiClient.get<any>("/api/users/me"),
                );
                if (!cancelled) {
                    setUser(res);
                    if (res.role === "admin") setIsAdmin(true);
                }
            } catch (err) {
                console.error("Failed to load user:", err);
                if (retries > 0) {
                    setTimeout(() => loadUser(retries - 1), 1000);
                } else {
                    router.push("/");
                }
            }
        };

        loadUser();
        return () => {
            cancelled = true;
        };
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
                {tabs.map(({ id, label, icon: Icon }) => (
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
