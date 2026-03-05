"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiClient } from "../lib/api";
import s from "./page.module.css";

export default function HomePage() {
    const router = useRouter();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const withTimeout = async <T,>(
            promise: Promise<T>,
            timeoutMs = 8000,
        ) => {
            return await Promise.race<T>([
                promise,
                new Promise<T>((_, reject) => {
                    setTimeout(
                        () => reject(new Error("Request timed out")),
                        timeoutMs,
                    );
                }),
            ]);
        };

        const run = async () => {
            const token = localStorage.getItem("token");
            if (!token) {
                if (!cancelled) setChecking(false);
                return;
            }

            try {
                const me = await withTimeout(
                    apiClient.get<any>("/api/users/me"),
                );
                const defaultTab = me?.settings?.defaultTab ?? "dashboard";
                const target =
                    defaultTab === "calendar" ||
                    defaultTab === "friends" ||
                    defaultTab === "profile"
                        ? `/${defaultTab}`
                        : "/dashboard";
                router.replace(target);
            } catch {
                apiClient.setToken(null);
                if (!cancelled) setChecking(false);
            } finally {
                if (!cancelled) setChecking(false);
            }
        };

        run();

        return () => {
            cancelled = true;
        };
    }, [router]);

    if (checking) {
        return (
            <div className={s.loading}>
                <div className={s.spinner} />
            </div>
        );
    }

    return (
        <div className={s.landing}>
            <div className={s.landingInner}>
                <div className={s.logoWrap}>
                    <Image
                        src="/favicon.svg"
                        alt="SocialAnimal Logo"
                        width={64}
                        height={64}
                        className={s.logo}
                    />
                </div>

                <h1 className={s.h1}>SocialAnimal</h1>

                <p className={s.tagline}>
                    Selfhosted Social Calendar.
                    <br />
                    Share your calendar with friends.
                </p>

                <div className={s.ctaRow}>
                    <button
                        className={s.ctaBtn}
                        onClick={() => router.push("/login")}
                    >
                        Get Started
                    </button>
                </div>

                <div className={s.pillRow}>
                    <span className={s.pill}>Easy Google Import</span>
                    <span className={s.pill}>ICS Import</span>
                    <span className={s.pill}>Permission System</span>
                </div>
            </div>
        </div>
    );
}
