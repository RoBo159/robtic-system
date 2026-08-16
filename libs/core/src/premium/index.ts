/**
 * The Premium Engine — the single source of truth for what a member is entitled to.
 *
 * Nothing outside this folder should read a Discord role to decide a perk. Consumers ask for a
 * *benefit* (`hasFeature`, `getMultiplier`, `getDurationMs`), and how that benefit is granted stays
 * an implementation detail here. That is what makes a new tier, a new role mapping or an entirely
 * different way of granting premium a configuration change rather than a code change.
 *
 * Importing this barrel registers the built-in feature catalogue.
 */
import "./features/definitions";

export {
    PremiumFeature,
    type PremiumFeatureKey,
} from "./features/definitions";

export {
    registerPremiumFeature,
    getPremiumFeature,
    allPremiumFeatures,
    premiumFeaturesByModule,
    clearPremiumFeatures,
    type PremiumFeatureDef,
} from "./features/registry";

export {
    resolveBenefits,
    type PremiumBenefits,
    type PremiumTierView,
    type PremiumHolding,
    type PremiumSource,
    type GlobalPremiumConfig,
    type MemberPremiumInput,
} from "./resolve-benefits";

export {
    setPremiumRoleProvider,
    startPremiumEngine,
    getBenefits,
    benefitsForRoles,
    hasFeature,
    getFeatureValue,
    getMultiplier,
    getDurationMs,
    getHighestTier,
    getPremiumRoles,
    getPremiumTiers,
    getGlobalPremiumConfig,
    invalidatePremiumGlobal,
    invalidatePremiumGuild,
    invalidatePremiumMember,
    clearPremiumCache,
    premiumCacheSize,
} from "./premium-engine";
