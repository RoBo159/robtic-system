/**
 * The engine's randomness.
 *
 * Genuinely random — `Math.random()`, not a seed. Nothing about a schedule can be worked out in
 * advance from the guild id and the date, by a member or by the bot: whether today carries a Hard,
 * how many Easy quests there are and what minute each lands on are all decided the moment the
 * planner first looks at that day, and not before.
 *
 * That makes every roll a one-off, which is why **every decision is written down as it is made**.
 * The generation row holds the count and the instant; the quest document holds the missions, the
 * reward and the lifetime. A restart, a second worker or a later tick reads what was decided rather
 * than rolling again — the unique indexes are what turn "decide once" into a guarantee rather than
 * a hope.
 *
 * This file used to hold a seeded PRNG for exactly the opposite reason: derivation meant a re-plan
 * recomputed an identical schedule, so nothing had to be persisted. Persisting the decisions costs
 * one row per tier per day and buys real unpredictability.
 */

/** An integer in `[min, max]`, inclusive at both ends. */
export function randomInt(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
}

/** A uniform instant in `[fromMs, toMs)`. */
export function randomInstant(fromMs: number, toMs: number): Date {
    const span = Math.max(0, toMs - fromMs);
    return new Date(fromMs + Math.floor(Math.random() * span));
}

/** Fisher-Yates, in place. Used to pick which windows a weekly tier lands in. */
export function shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
}
