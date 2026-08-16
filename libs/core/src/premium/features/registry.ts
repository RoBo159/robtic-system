import type { PremiumValueType, PremiumStacking } from "@constants";

export interface PremiumFeatureDef {
    /** Stable identifier, SCREAMING_SNAKE. Stored in the database and shown in the config command. */
    key: string;
    type: PremiumValueType;
    /**
     * What a member with no premium tier gets.
     *
     * Every consumer reads through the engine, so this is also the answer for a guild that has
     * configured nothing at all — which is the normal state and must behave exactly like today.
     */
    baseline: number | boolean;
    stacking: PremiumStacking;
    /** Which system consumes it. Groups the config UI and documents the dependency. */
    module: string;
    description: string;
}

const features = new Map<string, PremiumFeatureDef>();

/**
 * Registers one premium benefit.
 *
 * A feature is a *definition*, not a value: what it means, what shape its value has and what a
 * non-premium member gets. Every actual number lives in the database per guild per tier, which is
 * what lets a server run three tiers with three different quest bonuses without a code change.
 *
 * Adding a benefit is this call plus a consumer that asks for it. No existing system changes.
 */
export function registerPremiumFeature(def: PremiumFeatureDef): void {
    features.set(def.key, def);
}

export function getPremiumFeature(key: string): PremiumFeatureDef | undefined {
    return features.get(key);
}

export function allPremiumFeatures(): PremiumFeatureDef[] {
    return [...features.values()].sort((a, b) => a.module.localeCompare(b.module) || a.key.localeCompare(b.key));
}

export function premiumFeaturesByModule(): Map<string, PremiumFeatureDef[]> {
    const grouped = new Map<string, PremiumFeatureDef[]>();

    for (const def of allPremiumFeatures()) {
        const bucket = grouped.get(def.module) ?? [];
        bucket.push(def);
        grouped.set(def.module, bucket);
    }

    return grouped;
}

/** Test seam. Never called at runtime — the built-in catalogue registers once on import. */
export function clearPremiumFeatures(): void {
    features.clear();
}
