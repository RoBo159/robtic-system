/**
 * Verifies the Premium Engine's resolution rules — the pure part, with no database.
 *
 * `resolveBenefits` is where every perk in the bot is ultimately decided, so the properties below
 * are the ones a mistake would be most expensive in: a member with no tier must resolve to exactly
 * the old behaviour, and a member with several tiers must not accidentally stack.
 */
import { resolveBenefits, allPremiumFeatures, getPremiumFeature, PremiumFeature } from "@core/premium";
import type { GlobalPremiumConfig } from "@core/premium";
import type { IPremiumTier, IPremiumFeatureValue } from "@database/models";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

const tier = (key: string, rank: number): IPremiumTier =>
    ({ key, name: key, rank, emoji: "💎", color: null, enabled: true }) as IPremiumTier;

const value = (tierKey: string, feature: string, v: number | boolean): IPremiumFeatureValue =>
    ({ tierKey, feature, value: v }) as IPremiumFeatureValue;

const config: GlobalPremiumConfig = {
    tiers: [tier("prime", 10), tier("prime-plus", 20), tier("lifetime", 30)],
    values: [
        value("prime", PremiumFeature.QUEST_REWARD_BONUS, 5),
        value("prime-plus", PremiumFeature.QUEST_REWARD_BONUS, 10),
        value("lifetime", PremiumFeature.VIP_QUEST_ACCESS, true),
        value("prime", PremiumFeature.EXTRA_QUEST_SLOT, 1),
        value("prime-plus", PremiumFeature.EXTRA_QUEST_SLOT, 1),
        value("prime", PremiumFeature.VIP_QUEST_ACCESS, true),
    ],
};

const resolve = (input: Partial<Parameters<typeof resolveBenefits>[1]>) =>
    resolveBenefits(config, { membershipTiers: [], roleTiers: [], guildEnabled: true, ...input });

// 1. No tier is the old behaviour, exactly.
const none = resolve({});
check("a member with nothing is not premium", !none.isPremium && none.tier === null);
check(
    "every feature falls back to its baseline",
    allPremiumFeatures().every(def => none.values[def.key] === def.baseline),
);

// 2. Role-granted and membership-granted tiers are the same thing.
const viaRole = resolve({ roleTiers: ["prime"] });
const viaMembership = resolve({ membershipTiers: [{ tierKey: "prime", expiresAt: null }] });
check("a role grants the tier", viaRole.tier?.key === "prime");
check("a membership grants the same tier", viaMembership.tier?.key === "prime");
check(
    "both routes resolve identical values",
    JSON.stringify(viaRole.values) === JSON.stringify(viaMembership.values),
);
check("the source is reported", viaRole.holdings[0]?.source === "role" && viaMembership.holdings[0]?.source === "membership");

// 3. Highest rank wins, and does not stack.
const both = resolve({ roleTiers: ["prime", "prime-plus"] });
check("the highest tier answers", both.tier?.key === "prime-plus", both.tier?.key);
check("`highest` does not stack", both.values[PremiumFeature.QUEST_REWARD_BONUS] === 10, `${both.values[PremiumFeature.QUEST_REWARD_BONUS]}`);

// 4. …but an opt-in `sum` feature does.
check(
    "`sum` features stack across tiers",
    both.values[PremiumFeature.EXTRA_QUEST_SLOT] === 2,
    `${both.values[PremiumFeature.EXTRA_QUEST_SLOT]}`,
);
check("EXTRA_QUEST_SLOT is the stacking one on purpose", getPremiumFeature(PremiumFeature.EXTRA_QUEST_SLOT)?.stacking === "sum");

// 5. A top tier that leaves a perk unset must not take away what a lower one granted.
const lifetimeAndPrime = resolve({ roleTiers: ["lifetime", "prime"] });
check(
    "an unset perk falls through to a lower tier",
    lifetimeAndPrime.values[PremiumFeature.QUEST_REWARD_BONUS] === 5,
    `${lifetimeAndPrime.values[PremiumFeature.QUEST_REWARD_BONUS]}`,
);
check("the highest tier is still the one reported", lifetimeAndPrime.tier?.key === "lifetime");

// 6. A guild switch overrides everything held.
const disabled = resolveBenefits(config, {
    membershipTiers: [{ tierKey: "lifetime", expiresAt: null }],
    roleTiers: ["prime"],
    guildEnabled: false,
});
check("a disabled guild grants nothing", !disabled.isPremium && disabled.values[PremiumFeature.QUEST_REWARD_BONUS] === 0);

// 7. Unknown and disabled tiers grant nothing — a stale role map must not resolve.
check("an unknown tier key is ignored", !resolve({ roleTiers: ["deleted-tier"] }).isPremium);

const withDisabled: GlobalPremiumConfig = {
    tiers: [{ ...tier("prime", 10), enabled: false } as IPremiumTier],
    values: config.values,
};
check(
    "a disabled tier grants nothing",
    !resolveBenefits(withDisabled, { membershipTiers: [], roleTiers: ["prime"], guildEnabled: true }).isPremium,
);

// 8. Holding one tier twice counts once.
const doubled = resolve({ membershipTiers: [{ tierKey: "prime", expiresAt: null }], roleTiers: ["prime"] });
check("a tier held both ways is counted once", doubled.holdings.length === 1, `${doubled.holdings.length}`);
check("and reported as the membership", doubled.holdings[0]?.source === "membership");

// 9. The snapshot is frozen — it is cached and shared.
check("benefits are frozen", Object.isFrozen(viaRole) && Object.isFrozen(viaRole.values));

// 10. Every registered feature is well-formed, since the config command reads these blindly.
const malformed = allPremiumFeatures().filter(def =>
    (def.type === "flag" && typeof def.baseline !== "boolean")
    || (def.type !== "flag" && typeof def.baseline !== "number")
    || !def.module
    || !def.description
);
check("every feature definition is well-formed", malformed.length === 0, malformed.map(d => d.key).join(", "));
check("feature keys are unique", new Set(allPremiumFeatures().map(d => d.key)).size === allPremiumFeatures().length);
console.log(`      ${allPremiumFeatures().length} features across ${new Set(allPremiumFeatures().map(d => d.module)).size} modules`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
