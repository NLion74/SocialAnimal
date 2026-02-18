"use client";
import { useState, useEffect } from "react";
import { Calendar, Users, Home, User, LogOut } from "lucide-react";
import GeneralTab from "@/components/GeneralTab";
import FriendsTab from "@/components/FriendsTab";
import CalendarTab from "@/components/CalendarTab";
import ProfileTab from "@/components/ProfileTab";
import AuthModal from "@/components/AuthModal";
import s from "./page.module.css";

const TABS = [
    { id: "general", label: "Dashboard", icon: Home },
    { id: "calendar", label: "Calendar", icon: Calendar },
    { id: "friends", label: "Friends", icon: Users },
    { id: "profile", label: "Profile", icon: User },
];

export default function HomePage() {
    const [activeTab, setActiveTab] = useState("general");
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showAuthModal, setShowAuthModal] = useState(false);

    useEffect(() => {
        if (localStorage.getItem("token")) setIsAuthenticated(true);
    }, []);

    const handleLogin = (token: string) => {
        localStorage.setItem("token", token);
        setIsAuthenticated(true);
        setShowAuthModal(false);
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        setIsAuthenticated(false);
        setActiveTab("general");
    };

    if (!isAuthenticated) {
        return (
            <div className={s.landing}>
                <div className={s.landingInner}>
                    <div className={s.logoWrap}>
                        <Calendar size={28} color="var(--purple-400)" />
                    </div>
                    <h1 className={s.h1}>SocialAnimal</h1>
                    <p className={s.tagline}>
                        Share calendars with friends.
                        <br />
                        See when everyone's free.
                    </p>
                    <div className={s.ctaRow}>
                        <button
                            className={s.ctaBtn}
                            onClick={() => setShowAuthModal(true)}
                        >
                            Get Started
                        </button>
                    </div>
                    <div className={s.pillRow}>
                        <span className={s.pill}>📅 ICS Import</span>
                        <span className={s.pill}>👥 Friend Sharing</span>
                        <span className={s.pill}>🔒 Permission Control</span>
                    </div>
                </div>
                {showAuthModal && (
                    <AuthModal
                        onClose={() => setShowAuthModal(false)}
                        onLogin={handleLogin}
                    />
                )}
            </div>
        );
    }

    return (
        <div className={s.page}>
            {/* Header */}
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

            {/* Tab bar */}
            <div className={s.tabBar}>
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        className={`${s.tabBtn} ${activeTab === id ? s.active : ""}`}
                        onClick={() => setActiveTab(id)}
                    >
                        <Icon size={14} />
                        {label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <main className={s.main}>
                {activeTab === "general" && <GeneralTab />}
                {activeTab === "calendar" && <CalendarTab />}
                {activeTab === "friends" && <FriendsTab />}
                {activeTab === "profile" && <ProfileTab />}
            </main>
        </div>
    );
}
