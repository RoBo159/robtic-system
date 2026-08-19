import { apiGet } from "@/lib/api.server";
import type { GuildSettings } from "@/lib/types";

export default async function OverviewPage({ params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;
    const settings = await apiGet<GuildSettings>(`/guilds/${guildId}/settings`);

    const on = settings.features.filter(feature => feature.enabled);

    return (
        <>
            <h1 className="page-title">Overview</h1>
            <p className="page-lede">What the bot is currently doing in this server.</p>

            <section className="card">
                <h3>Invocation</h3>
                <p className="hint">How members reach commands here.</p>
                <div className="row">
                    <span className="badge">Prefix</span>
                    <code>{settings.prefix ?? "! (default)"}</code>
                </div>
                <div className="row">
                    <span className="badge">Commands channel</span>
                    {settings.commandsChannelId
                        ? <code>#{settings.commandsChannelId}</code>
                        : <span className="empty">unrestricted</span>}
                </div>
            </section>

            <section className="card">
                <h3>Features</h3>
                <p className="hint">{on.length} of {settings.features.length} switched on.</p>
                <div className="row">
                    {settings.features.map(feature => (
                        <span key={feature.key} className={`badge ${feature.enabled ? "on" : "off"}`}>
                            {feature.key}
                        </span>
                    ))}
                </div>
            </section>

            <section className="card">
                <h3>Staff tiers</h3>
                <p className="hint">Scores gate every command that declares a required permission.</p>
                {settings.staffTiers.length === 0 ? (
                    <p className="empty">No tiers configured — only administrators can use gated commands.</p>
                ) : (
                    <div className="scroll-x">
                        <table>
                            <thead>
                                <tr><th>Tier</th><th>Score</th><th>Roles</th></tr>
                            </thead>
                            <tbody>
                                {settings.staffTiers.map(tier => (
                                    <tr key={tier.key}>
                                        <td>{tier.key}</td>
                                        <td>{tier.score}</td>
                                        <td>{tier.roleIds.length}</td>
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
