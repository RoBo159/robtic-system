import { useState } from "react";
import { useDiscordAuth } from "../hooks/use-discord-auth";
import { useAdminConfig } from "../hooks/use-admin-config";
import { UserSearch } from "../components/user-search";
import { UserMenu, type UserMenuItem } from "../components/user-menu";
import { Icon } from "../components/icon";
import { Landing } from "./landing";
import { ProfileView } from "./profile-view";
import { LeaderboardView } from "./leaderboard-view";
import { ProjectsView } from "./projects-view";
import { AdminView } from "./admin-view";
import { ModerationView } from "./moderation-view";
import { BotAdminView } from "./bot-admin-view";
import { LangToggle } from "../components/lang-toggle";

type Tab = "home" | "profile" | "top" | "projects" | "moderation" | "admin" | "bot";

function viewerAvatarUrl(userId: string, avatar: string | null | undefined): string | null {
    if (!avatar) return null;
    const ext = avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${ext}?size=128`;
}

export function Home() {
    const state = useDiscordAuth();
    const [tab, setTab] = useState<Tab>("home");
    /** Null means "the signed-in user"; set when a search result or leaderboard row is opened. */
    const [viewedUserId, setViewedUserId] = useState<string | null>(null);

    // Only fetch once the SDK handshake has configured the API client with a token + guild id.
    const authed = state.status === "authenticated" && Boolean(state.session.guildId);
    const admin = useAdminConfig(authed);
    const isAdmin = admin.status === "ready" && admin.data.isAdmin;
    const isSuperUser = admin.status === "ready" && admin.data.isSuperUser;
    // Projects exist only inside the configured dev server.
    const isDevGuild = admin.status === "ready" && admin.data.isDevGuild;

    if (state.status === "connecting") {
        return (
            <div className="centered">
                <div>
                    <div className="spinner" aria-label="Connecting" />
                    <p className="muted">Connecting to Discord…</p>
                </div>
            </div>
        );
    }

    if (state.status === "error") {
        return (
            <div className="centered">
                <div>
                    <p className="error">Failed to connect</p>
                    <p className="muted">{state.message}</p>
                </div>
            </div>
        );
    }

    if (!state.session.guildId) {
        return (
            <div className="centered">
                <p className="muted">Open this activity inside a server to see profiles and leaderboards.</p>
            </div>
        );
    }

    const viewer = state.session.auth.user;
    const viewerName = ("global_name" in viewer && viewer.global_name) || viewer.username;
    const viewerAvatar = viewerAvatarUrl(viewer.id, viewer.avatar);

    function openProfile(userId: string) {
        setViewedUserId(userId);
        setTab("profile");
    }

    function navigate(destination: Tab) {
        if (destination === "profile") setViewedUserId(null);
        setTab(destination);
    }

    /** Everything lives in the avatar dropdown; the topbar itself stays search + lang + Top. */
    const menuItems: UserMenuItem[] = [
        { id: "home", label: "Home", icon: "home" },
        { id: "profile", label: "My Profile", icon: "user" },
        ...(isDevGuild ? [{ id: "projects", label: "Projects", icon: "rocket" } as UserMenuItem] : []),
        ...(isAdmin ? [
            { id: "moderation", label: "Moderate", icon: "scale" } as UserMenuItem,
            { id: "admin", label: "Admin Panel", icon: "gear" } as UserMenuItem,
        ] : []),
        ...(isSuperUser ? [{ id: "bot", label: "Bot Admin", icon: "shield" } as UserMenuItem] : []),
    ];

    // If a gated tab is open without the matching flag (bootstrap resolved late), fall back home.
    let activeTab: Tab = tab;
    if ((tab === "admin" || tab === "moderation") && !isAdmin) activeTab = "home";
    if (tab === "bot" && !isSuperUser) activeTab = "home";
    if (tab === "projects" && !isDevGuild) activeTab = "home";

    return (
        <div className="app">
            <nav className="topbar">
                <div className="topbar__inner">
                    <UserMenu
                        userName={viewerName}
                        avatarUrl={viewerAvatar}
                        userId={viewer.id}
                        items={menuItems}
                        activeId={activeTab}
                        onSelect={(id) => navigate(id as Tab)}
                    />

                    <UserSearch onSelect={(r) => openProfile(r.discordId)} />

                    <LangToggle enabled={authed} />

                    <button
                        type="button"
                        className="leaderboard-button"
                        title="Leaderboard"
                        aria-pressed={activeTab === "top"}
                        onClick={() => setTab("top")}
                    >
                        <Icon name="trophy" size={17} />
                        <span className="leaderboard-button__label">Top</span>
                    </button>
                </div>
            </nav>

            <div className="app__body">
                {activeTab === "home" && (
                    <Landing userName={viewerName} avatarUrl={viewerAvatar} userId={viewer.id} />
                )}
                {activeTab === "profile" && (
                    <ProfileView userId={viewedUserId} onBack={viewedUserId ? () => setViewedUserId(null) : null} />
                )}
                {activeTab === "top" && <LeaderboardView onSelectUser={openProfile} />}
                {activeTab === "projects" && isDevGuild && <ProjectsView />}
                {activeTab === "moderation" && isAdmin && <ModerationView />}
                {activeTab === "admin" && isAdmin && admin.status === "ready" && <AdminView data={admin.data} />}
                {activeTab === "bot" && isSuperUser && <BotAdminView currentGuildId={state.session.guildId} />}
            </div>
        </div>
    );
}
