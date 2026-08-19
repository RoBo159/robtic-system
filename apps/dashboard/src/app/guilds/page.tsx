import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { apiGet, publicApiUrl } from "@/lib/api.server";
import type { GuildSummary } from "@/lib/types";

export default async function GuildPickerPage() {
    let guilds: GuildSummary[];

    try {
        guilds = await apiGet<GuildSummary[]>("/guilds");
    } catch (error) {
        // The session expired or was never established. Sending them to the landing page is the
        // only useful answer; rendering an error tells them nothing they can act on.
        if (error instanceof ApiError && error.status === 401) redirect("/");
        throw error;
    }

    return (
        <main className="main">
            <h1 className="page-title">Your servers</h1>
            <p className="page-lede">
                Servers where you have Manage Server and the bot is present. Missing one? Invite the bot, or ask an
                admin for the permission.
            </p>

            {guilds.length === 0 ? (
                <p className="empty">
                    Nothing to configure yet. <a href={`${publicApiUrl()}/auth/logout`}>Sign out</a>
                </p>
            ) : (
                <div className="grid-guilds">
                    {guilds.map(guild => (
                        <Link key={guild.id} href={`/g/${guild.id}`} className="guild-card">
                            {guild.icon ? (
                                <img
                                    className="guild-icon"
                                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=80`}
                                    alt=""
                                />
                            ) : (
                                <span className="guild-icon" aria-hidden />
                            )}
                            <span>
                                <strong>{guild.name}</strong>
                                <br />
                                <span className="badge">{guild.owner ? "Owner" : "Manager"}</span>
                            </span>
                        </Link>
                    ))}
                </div>
            )}
        </main>
    );
}
