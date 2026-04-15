"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Calendar, Users, Shield, Zap, Globe, Lock } from "lucide-react";
import { apiClient } from "../lib/api";
import s from "./page.module.css";

const FEATURES = [
    {
        icon: Calendar,
        title: "Keep your calendar",
        desc: "Import from Google Calendar, CalDAV, iCloud, or any ICS feed. No lock-in.",
    },
    {
        icon: Users,
        title: "Share with Friends",
        desc: "Add friends by email and share individual calendars with full control.",
    },
    {
        icon: Shield,
        title: "Granular Permissions",
        desc: "Choose what each friend sees - busy only, event titles, or full details.",
    },
    {
        icon: Zap,
        title: "Auto-Sync",
        desc: "Calendars stay up to date automatically on configurable intervals.",
    },
    {
        icon: Globe,
        title: "ICS Export",
        desc: "Export shared calendars back to any calendar client via an ICS link.",
    },
    {
        icon: Lock,
        title: "Self-Hosted",
        desc: "Run it on your own server. Your data stays yours.",
    },
];

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
            <div className={s.hero}>
                <div className={s.logoWrap}>
                    <Image
                        src="/favicon.svg"
                        alt="SocialAnimal Logo"
                        width={120}
                        height={120}
                        className={s.logo}
                    />
                </div>

                <h1 className={s.h1}>SocialAnimal</h1>

                <p className={s.tagline}>
                    Share your calendar with friends —
                    <br />
                    without giving up your calendar provider.
                </p>

                <div className={s.ctaRow}>
                    <button
                        className={s.ctaBtn}
                        onClick={() => router.push("/register")}
                    >
                        Get Started
                    </button>
                    <button
                        className={s.ctaBtnSecondary}
                        onClick={() => router.push("/login")}
                    >
                        Sign In
                    </button>
                </div>

                <div className={s.pillRow}>
                    <span className={s.pill}>Google Calendar</span>
                    <span className={s.pill}>CalDAV / iCloud</span>
                    <span className={s.pill}>ICS / iCal</span>
                    <span className={s.pill}>Self-Hosted</span>
                </div>
            </div>

            <div className={s.features}>
                {FEATURES.map(({ icon: Icon, title, desc }) => (
                    <div key={title} className={s.featureCard}>
                        <div className={s.featureHeader}>
                            <div className={s.featureIcon}>
                                <Icon size={18} />
                            </div>
                            <div className={s.featureTitle}>{title}</div>
                        </div>
                        <div className={s.featureDesc}>{desc}</div>
                    </div>
                ))}
            </div>

            <footer className={s.footer}>
                <a
                    href="https://github.com/NLion74/SocialAnimal"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={s.footerLink}
                >
                    GitHub
                </a>
            </footer>
        </div>
    );
}
