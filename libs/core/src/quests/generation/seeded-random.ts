/**
 * A deterministic pseudo-random source keyed by a string.
 *
 * Generation rolls its scheduled instant, missions and reward from this rather than `Math.random`,
 * so two processes — or one process before and after a restart — computing the same occasion arrive
 * at the same answer. That is what turns a race between planners into a non-event: the loser's row
 * would have been byte-identical to the winner's.
 *
 * FNV-1a for the hash and mulberry32 for the stream: small, dependency-free, and more than uniform
 * enough for picking a minute inside a window.
 */
export function hashSeed(input: string): number {
    let hash = 2166136261;

    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

/** A repeatable `() => number` in [0, 1), from a seed. */
export function seededRandom(seed: number): () => number {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The stream for one generation occasion. */
export function occasionRandom(guildId: string, tier: string, windowKey: string): () => number {
    return seededRandom(hashSeed(`${guildId}|${tier}|${windowKey}`));
}

/** An inclusive integer from a stream. */
export function randomInt(random: () => number, min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(random() * (max - min + 1));
}
