import type { IPremiumTier, IPremiumFeatureValue } from "@database/models";
import { getPremiumFeature, allPremiumFeatures } from "./features/registry";

export interface PremiumTierView {
    key: string;
    name: string;
    rank: number;
    emoji: string;
    color: string | null;
}

/** Why a member holds a tier. Both grant exactly the same thing. */
export type PremiumSource = "membership" | "role";

export interface PremiumHolding {
    tier: PremiumTierView;
    source: PremiumSource;
    /** Null for a permanent membership or a role-granted tier. */
    expiresAt: Date | null;
}

/**
 * Everything premium about one member, resolved once.
 *
 * Handed out frozen: it is cached and shared between callers, and a consumer that mutated it would
 * change what everyone else sees for the rest of the TTL.
 */
export interface PremiumBenefits {
    /** The highest-ranked tier held, or null. */
    tier: PremiumTierView | null;
    /** Every tier held, highest first. */
    holdings: PremiumHolding[];
    isPremium: boolean;
    /** Feature key → resolved value. Contains every registered feature, baseline included. */
    values: Readonly<Record<string, number | boolean>>;
}

/** The global half of the configuration: the same ladder everywhere the bot runs. */
export interface GlobalPremiumConfig {
    tiers: IPremiumTier[];
    values: IPremiumFeatureValue[];
}

/** The per-member half: what they hold globally, and which roles this server maps. */
export interface MemberPremiumInput {
    /** Tier keys from live global memberships. */
    membershipTiers: { tierKey: string; expiresAt: Date | null }[];
    /** Tier keys granted by roles the member holds in this guild. */
    roleTiers: string[];
    /** This guild's premium switch. Off answers with baselines whatever the member holds. */
    guildEnabled: boolean;
}

const toView = (tier: IPremiumTier): PremiumTierView => ({
    key: tier.key,
    name: tier.name,
    rank: tier.rank,
    emoji: tier.emoji,
    color: tier.color,
});

/**
 * Combines the tiers a member holds into one value per feature.
 *
 * `highest` — take the top-ranked tier's value, and only that one, because a premium ladder is a
 * ladder: Prime Pro replaces Prime rather than adding to it. Falling through to lower tiers when
 * the top one leaves a perk unset matters — a new tier that has not been fully configured must not
 * silently take away what the tier below it granted.
 *
 * `sum` and `max` exist for genuinely additive perks and are opt-in per feature, so nothing becomes
 * stackable by accident.
 */
function combine(
    feature: string,
    ownedTiers: IPremiumTier[],
    valueFor: (tierKey: string, feature: string) => number | boolean | undefined,
): number | boolean {
    const def = getPremiumFeature(feature)!;

    if (ownedTiers.length === 0) return def.baseline;

    if (def.stacking === "highest") {
        for (const tier of ownedTiers) {
            const value = valueFor(tier.key, feature);
            if (value !== undefined) return value;
        }
        return def.baseline;
    }

    const numbers = ownedTiers
        .map(tier => valueFor(tier.key, feature))
        .filter((value): value is number => typeof value === "number");

    if (numbers.length === 0) return def.baseline;

    return def.stacking === "sum"
        ? numbers.reduce((total, value) => total + value, 0)
        : Math.max(...numbers);
}

/**
 * Resolves a member's benefits.
 *
 * Pure — no database, no gateway, no cache. That is what makes the engine testable, and what lets
 * the caching layer above it stay a thin wrapper rather than a second implementation.
 */
export function resolveBenefits(config: GlobalPremiumConfig, input: MemberPremiumInput): PremiumBenefits {
    const baseline = Object.fromEntries(allPremiumFeatures().map(def => [def.key, def.baseline]));
    const empty = Object.freeze({ tier: null, holdings: [], isPremium: false, values: Object.freeze(baseline) });

    if (!input.guildEnabled || config.tiers.length === 0) return empty;

    const byKey = new Map(config.tiers.filter(tier => tier.enabled).map(tier => [tier.key, tier]));

    const holdings: PremiumHolding[] = [];
    const seen = new Set<string>();

    const take = (tierKey: string, source: PremiumSource, expiresAt: Date | null) => {
        const tier = byKey.get(tierKey);
        if (!tier || seen.has(tier.key)) return;

        seen.add(tier.key);
        holdings.push({ tier: toView(tier), source, expiresAt });
    };

    for (const membership of input.membershipTiers) take(membership.tierKey, "membership", membership.expiresAt);
    for (const tierKey of input.roleTiers) take(tierKey, "role", null);

    if (holdings.length === 0) return empty;

    holdings.sort((a, b) => b.tier.rank - a.tier.rank);
    const ownedTiers = holdings.map(holding => byKey.get(holding.tier.key)!);

    const index = new Map<string, number | boolean>();
    for (const row of config.values) index.set(`${row.tierKey}:${row.feature}`, row.value);
    const valueFor = (tierKey: string, feature: string) => index.get(`${tierKey}:${feature}`);

    const values: Record<string, number | boolean> = { ...baseline };
    for (const def of allPremiumFeatures()) {
        values[def.key] = combine(def.key, ownedTiers, valueFor);
    }

    return Object.freeze({
        tier: holdings[0]!.tier,
        holdings,
        isPremium: true,
        values: Object.freeze(values),
    });
}
