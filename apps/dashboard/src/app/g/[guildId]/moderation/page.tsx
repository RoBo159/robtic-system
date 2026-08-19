import { apiGet } from "@/lib/api.server";
import type { AuditEntry, ModerationCase } from "@/lib/types";

const when = (iso: string) => new Date(iso).toLocaleString();

export default async function ModerationPage({ params }: { params: Promise<{ guildId: string }> }) {
    const { guildId } = await params;

    const [cases, audit] = await Promise.all([
        apiGet<ModerationCase[]>(`/guilds/${guildId}/moderation/cases?limit=50`),
        apiGet<AuditEntry[]>(`/guilds/${guildId}/moderation/audit?limit=50`),
    ]);

    return (
        <>
            <h1 className="page-title">Moderation</h1>
            <p className="page-lede">
                Read-only. Actions stay in Discord, where the proof flow, approval routing and role-hierarchy checks
                run — a web form would skip all three.
            </p>

            <section className="card">
                <h3>Recent cases</h3>
                <p className="hint">Newest first, across the whole server.</p>
                {cases.length === 0 ? (
                    <p className="empty">No cases recorded.</p>
                ) : (
                    <div className="scroll-x">
                        <table>
                            <thead>
                                <tr><th>Case</th><th>Type</th><th>Member</th><th>Moderator</th><th>Reason</th><th>State</th><th>When</th></tr>
                            </thead>
                            <tbody>
                                {cases.map(entry => (
                                    <tr key={entry.caseId}>
                                        <td><code>{entry.caseId}</code></td>
                                        <td>{entry.type}</td>
                                        <td><code>{entry.userId}</code></td>
                                        <td><code>{entry.moderatorId}</code></td>
                                        <td>{entry.reason}</td>
                                        <td>
                                            <span className={`badge ${entry.active ? "off" : "on"}`}>
                                                {entry.active ? "active" : "closed"}
                                            </span>
                                        </td>
                                        <td>{when(entry.createdAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="card">
                <h3>Security audit</h3>
                <p className="hint">Kicks, bans, role grants and channel changes the bot observed.</p>
                {audit.length === 0 ? (
                    <p className="empty">Nothing logged yet.</p>
                ) : (
                    <div className="scroll-x">
                        <table>
                            <thead>
                                <tr><th>Event</th><th>Source</th><th>Actor</th><th>Target</th><th>When</th></tr>
                            </thead>
                            <tbody>
                                {audit.map((entry, index) => (
                                    <tr key={`${entry.eventName}-${entry.createdAt}-${index}`}>
                                        <td>{entry.eventName}</td>
                                        <td>{entry.source}</td>
                                        <td>{entry.actorId ? <code>{entry.actorId}</code> : "—"}</td>
                                        <td>{entry.targetId ? <code>{entry.targetId}</code> : "—"}</td>
                                        <td>{when(entry.createdAt)}</td>
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
