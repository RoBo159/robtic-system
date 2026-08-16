import type { IPremiumTier } from "@database/models";
import type { PremiumFeatureDef, PremiumTierView } from "@core/premium";

export const tierLabel = (tier: IPremiumTier | PremiumTierView): string => `${tier.emoji} **${tier.name}**`;

/**
 * Renders a configured value in the unit its definition actually means.
 *
 * One `value` column holds percentages, counts, hours and flags, so without the definition a `12`
 * on screen is ambiguous — twelve percent, twelve slots or twelve hours are very different perks.
 */
export function formatFeatureValue(def: PremiumFeatureDef | undefined, value: number | boolean): string {
    if (typeof value === "boolean") return value ? "yes" : "no";

    switch (def?.type) {
        case "percent": return `${value > 0 ? "+" : ""}${value}%`;
        case "duration": return value === 1 ? "1 hour" : `${value} hours`;
        case "flag": return value > 0 ? "yes" : "no";
        default: return `${value}`;
    }
}

/** What `/premium-config feature set` accepts for a feature, so the error can say it. */
export function valueHint(def: PremiumFeatureDef): string {
    switch (def.type) {
        case "percent": return "a percentage, e.g. `10` for +10%";
        case "count": return "a whole number, e.g. `1`";
        case "duration": return "hours, e.g. `12`";
        case "flag": return "`1` to grant it, `0` to take it away";
    }
}
