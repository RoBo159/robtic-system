import type { ReactNode } from "react";
import { GuildNav } from "@/components/guild-nav";
import { publicApiUrl } from "@/lib/api.server";

export default async function GuildLayout({
    children,
    params,
}: {
    children: ReactNode;
    params: Promise<{ guildId: string }>;
}) {
    const { guildId } = await params;

    return (
        <div className="shell">
            <nav className="sidebar">
                <strong>Robtic</strong>
                <GuildNav guildId={guildId} />
                <h2>Session</h2>
                <a href={`${publicApiUrl()}/auth/logout`}>Sign out</a>
                <a href="/guilds">Switch server</a>
            </nav>
            <div className="main">{children}</div>
        </div>
    );
}
