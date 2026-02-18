"use client";
import { useState, useEffect } from "react";
import { Share2, LayoutDashboard, Users, Calendar, LogOut } from "lucide-react";
import GeneralTab from "@/components/GeneralTab";
import FriendsTab from "@/components/FriendsTab";
import CalendarTab from "@/components/CalendarTab";
import AuthModal from "@/components/AuthModal";
import s from "./page.module.css";

const TABS = [
    { id: "general", label: "Dashboard", Icon: LayoutDashboard },
    { id: "friends", label: "Friends", Icon: Users },
    { id: "calendar", label: "Calendar", Icon: Calendar },
];

export default function HomePage() {
    const [activeTab, setActiveTab] = useState("general");
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showAuth, setShowAuth] = useState(false);

    useEffect(() => {
        if (localStorage.getItem("token")) setIsAuthenticated(true);
    }, []);

    const login = (token: string) => {
        localStorage.setItem("token", token);
        setIsAuthenticated(true);
        setShowAuth(false);
    };
    const logout = () => {
        localStorage.removeItem("token");
        setIsAuthenticated(false);
    };

    if (!isAuthenticated)
        return (
            <div className={s.landing}>
                <div className={s.landingInner}>
                    <div className={s.logoWrap}>
                        <Share2 size={26} color="var(--purple-400)" />
                    </div>
                    <h1 className={s.h1}>SocialAnimal</h1>
                    <p className={s.tagline}>
                        Open-source calendar sharing for friends.
                        <br />
                        Import from Google, Apple, Proton or any ICS feed.
                    </p>
                    <div className={s.ctaRow}>
                        <button
                            className={s.ctaBtn}
                            onClick={() => setShowAuth(true)}
                        >
                            Get Started
                        </button>
                    </div>
                    <div className={s.pillRow}>
                        {["Google", "Apple", "Proton", "ICS URL"].map((f) => (
                            <span key={f} className={s.pill}>
                                {f}
                            </span>
                        ))}
                    </div>
                </div>
                {showAuth && (
                    <AuthModal
                        onLogin={login}
                        onClose={() => setShowAuth(false)}
                    />
                )}
            </div>
        );

    return (
        <div className={s.page}>
            <header className={s.header}>
                <div className={s.brand}>
                    <div className={s.brandIcon}>
                        <Share2 size={13} color="var(--purple-400)" />
                    </div>
                    <span className={s.brandName}>SocialAnimal</span>
                </div>
                <button className={s.logoutBtn} onClick={logout}>
                    <LogOut size={13} /> Sign out
                </button>
            </header>

            <nav className={s.tabBar}>
                {TABS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => setActiveTab(id)}
                        className={`${s.tabBtn}${activeTab === id ? ` ${s.active}` : ""}`}
                    >
                        <Icon size={14} />
                        {label}
                    </button>
                ))}
            </nav>

            <main className={s.main}>
                {activeTab === "general" && <GeneralTab />}
                {activeTab === "friends" && <FriendsTab />}
                {activeTab === "calendar" && <CalendarTab />}
            </main>
        </div>
    );
}
