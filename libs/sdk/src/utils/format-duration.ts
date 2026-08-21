/**
 * Renders a millisecond span the way both the Discord embeds and the in-game messages show it.
 * Shared so a jail described as "2h 30m" in chat is never "150 minutes" in the audit log.
 */
export function formatDuration(milliseconds: number | null): string {
    if (milliseconds === null) return "Permanent";
    if (milliseconds < 1000) return "0s";

    const units: Array<[label: string, size: number]> = [
        ["d", 86_400_000],
        ["h", 3_600_000],
        ["m", 60_000],
        ["s", 1000],
    ];

    const parts: string[] = [];
    let remaining = milliseconds;

    for (const [label, size] of units) {
        const value = Math.floor(remaining / size);
        if (value > 0) {
            parts.push(`${value}${label}`);
            remaining -= value * size;
        }
        if (parts.length === 2) break;
    }

    return parts.join(" ");
}

/**
 * Parses the duration syntax moderators type: `30m`, `2h`, `7d`, `1h30m`. Returns null for the
 * literal "perm"/"permanent", and undefined when the text is not a duration at all.
 */
export function parseDuration(input: string): number | null | undefined {
    const text = input.trim().toLowerCase();
    if (text === "perm" || text === "permanent" || text === "forever") return null;

    const pattern = /(\d+)\s*(d|h|m|s)/g;
    const sizes: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };

    let total = 0;
    let matched = false;
    for (const match of text.matchAll(pattern)) {
        matched = true;
        total += Number(match[1]) * sizes[match[2] as keyof typeof sizes];
    }

    return matched ? total : undefined;
}
