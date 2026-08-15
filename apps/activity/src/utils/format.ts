export function formatNumber(value: number): string {
    return value.toLocaleString();
}

/** Compact "2d 4h" / "35m" style duration, matching the bot's formatDuration output shape. */
export function formatDuration(ms: number): string {
    if (ms <= 0) return "now";

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

/**
 * A span of time that has already elapsed, in seconds — voice totals.
 *
 * Separate from formatDuration because that one renders a *countdown* and reads 0 as "now",
 * which is the wrong word for a member who has spent no time in voice.
 */
export function formatSeconds(seconds: number): string {
    if (seconds <= 0) return "0m";

    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
}

export function formatRank(rank: number): string {
    return rank > 0 ? `#${rank}` : "—";
}

/** Compact "3d ago" / "5m ago" style relative timestamp for detail lists. */
export function formatTimeAgo(timestampMs: number): string {
    const elapsed = Date.now() - timestampMs;
    if (elapsed < 60_000) return "just now";
    return `${formatDuration(elapsed)} ago`;
}
