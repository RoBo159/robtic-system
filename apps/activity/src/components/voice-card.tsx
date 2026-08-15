import type { Profile } from "../types/profile";
import { formatNumber, formatRank, formatSeconds, formatTimeAgo } from "../utils/format";
import { Icon } from "./icon";

/**
 * Voice totals. Connected is wall-clock time in a channel; active is the subset that wasn't AFK
 * and therefore actually earned — the gap between the two is the point of showing both.
 */
export function VoiceCard({ voice }: { voice: Profile["voice"] }) {
    const activeShare = voice.totalConnectedSeconds > 0
        ? Math.min(100, Math.round((voice.totalActiveSeconds / voice.totalConnectedSeconds) * 100))
        : 0;

    return (
        <section className="card">
            <h2 className="card__title"><Icon name="mic" size={14} /> Voice</h2>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 26, fontWeight: 700 }}>{formatSeconds(voice.totalActiveSeconds)}</span>
                <span className="muted">{formatRank(voice.rank)} by active time</span>
            </div>
            <div className="progress">
                <div className="progress__fill progress__fill--xp" style={{ width: `${activeShare}%` }} />
            </div>
            <div className="progress-row">
                <span>{formatSeconds(voice.totalConnectedSeconds)} connected</span>
                <span>{activeShare}% active</span>
            </div>

            <div className="stat-grid" style={{ marginTop: 12 }}>
                <div className="stat stat--xp">
                    <span className="stat__label">Voice XP</span>
                    <div className="stat__value">{formatNumber(voice.totalXpEarned)}</div>
                </div>
                <div className="stat stat--xp">
                    <span className="stat__label">Sessions</span>
                    <div className="stat__value">{formatNumber(voice.sessionCount)}</div>
                    <div className="stat__meta">avg {formatSeconds(voice.averageSessionSeconds)}</div>
                </div>
                <div className="stat stat--xp">
                    <span className="stat__label">Longest</span>
                    <div className="stat__value">{formatSeconds(voice.longestSessionSeconds)}</div>
                </div>
            </div>

            <p className="muted" style={{ marginBottom: 0, marginTop: 12 }}>
                {voice.sessionCount === 0
                    ? "No voice activity yet — join a voice channel to start earning."
                    : voice.lastSeenAt !== null
                        ? `Last in voice ${formatTimeAgo(voice.lastSeenAt)}.`
                        : "Voice XP counts toward the same level as chat XP."}
            </p>
        </section>
    );
}
