import { apiGet } from "@/lib/api.server";
import type { LeaderboardEntry } from "@/lib/types";

export default async function EconomyPage({ params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;
    const leaderboard = await apiGet<LeaderboardEntry[]>(`/guilds/${guildId}/economy/leaderboard`);

    return (
        <>
            <h1 className="page-title">Economy</h1>
            <p className="page-lede">
                Coin balances are global to the bot rather than per server, so this leaderboard spans every server the
                bot is in.
            </p>

            <section className="card">
                <h3>Top balances</h3>
                {leaderboard.length === 0 ? (
                    <p className="empty">Nobody has earned coins yet.</p>
                ) : (
                    <div className="scroll-x">
                        <table>
                            <thead>
                                <tr><th>#</th><th>Member</th><th>Coins</th></tr>
                            </thead>
                            <tbody>
                                {leaderboard.map(entry => (
                                    <tr key={entry.userId}>
                                        <td>{entry.rank}</td>
                                        <td>{entry.username} <code>{entry.userId}</code></td>
                                        <td>{entry.coins.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </>
    );
}
