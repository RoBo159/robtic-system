import { apiGet } from "@/lib/api.server";
import { QuestSettingsForm } from "@/components/quest-settings-form";
import type { GuildDirectory, QuestBoardEntry, QuestSettings } from "@/lib/types";

const when = (iso: string) => new Date(iso).toLocaleString();

export default async function QuestsPage({ params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const [settings, board, directory] = await Promise.all([
        apiGet<QuestSettings>(`/guilds/${guildId}/quests/settings`),
        apiGet<QuestBoardEntry[]>(`/guilds/${guildId}/quests/board`),
        apiGet<GuildDirectory>(`/guilds/${guildId}/directory`),
    ]);

    return (
        <>
            <h1 className="page-title">Quests</h1>
            <p className="page-lede">Where quests post, which difficulties run, and what is open right now.</p>

            <QuestSettingsForm guildId={guildId} settings={settings} directory={directory} />

            <section className="card">
                <h3>Open board</h3>
                <p className="hint">{board.length} quest(s) currently claimable.</p>
                {board.length === 0 ? (
                    <p className="empty">Nothing open. Quests appear inside the configured windows.</p>
                ) : (
                    <div className="scroll-x">
                        <table>
                            <thead>
                                <tr><th>Tier</th><th>Missions</th><th>Reward</th><th>Slots</th><th>Ends</th></tr>
                            </thead>
                            <tbody>
                                {board.map(quest => (
                                    <tr key={quest.id}>
                                        <td><span className="badge">{quest.tier}</span></td>
                                        <td>{quest.missions.map(mission => mission.label).join(" · ")}</td>
                                        <td>{quest.reward}</td>
                                        <td>
                                            {quest.slotsTotal === null
                                                ? `${quest.slotsTaken} taken (no cap)`
                                                : `${quest.slotsTaken}/${quest.slotsTotal}`}
                                        </td>
                                        <td>{when(quest.endsAt)}</td>
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
