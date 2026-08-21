import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants";

/**
 * Turns a `?limit=` query string into a row count a database query can be given.
 *
 * Clamps rather than rejects, on purpose: a limit is a hint about how much of a list to render, and
 * failing a moderator's page load with a 400 because a link carried `?limit=0` helps nobody. Garbage
 * and out-of-range values both land on a sane number.
 *
 * Lived as a private `pageSize()` in the moderation controller. It is here because paging is not a
 * moderation concept, and the second list endpoint that needs it should not grow a second copy.
 */
export function resolveLimit(
    raw: string | undefined,
    fallback: number = DEFAULT_PAGE_SIZE,
    max: number = MAX_PAGE_SIZE,
): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(Math.floor(parsed), max);
}
