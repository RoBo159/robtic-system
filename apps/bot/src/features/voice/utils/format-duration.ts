/** `3h 12m` — compact enough for an embed field, exact enough to be useful. */
export function formatVoiceDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;

    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}
