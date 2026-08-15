import type { TopCategory } from "@constants";
import { formatVoiceDuration } from "@bot/features/voice/utils/format-duration";

/**
 * Renders a leaderboard value in the unit that category actually measures.
 *
 * Voice is stored in seconds, and "12480 seconds" is not a number anyone reads — every other
 * category is already a plain count, so this is the one that needs converting rather than
 * labelling.
 */
export function formatTopValue(category: TopCategory, value: number, unit: string): string {
    if (category === "voice") return formatVoiceDuration(value);
    return unit ? `${value} ${unit}` : `${value}`;
}
