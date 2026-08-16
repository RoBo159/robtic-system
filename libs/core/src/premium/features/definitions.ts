import { registerPremiumFeature } from "./registry";

/**
 * The built-in benefit catalogue.
 *
 * `PremiumFeature.X` is what consumers import, so a typo is a compile error rather than a silently
 * absent perk. The strings are what the database and the config command use.
 *
 * Every baseline is "what happens today": a guild that configures nothing must behave exactly as it
 * did before this system existed, and a feature nobody has configured must never change a number.
 */
export const PremiumFeature = {
    // Quests
    VIP_QUEST_ACCESS: "VIP_QUEST_ACCESS",
    QUEST_REWARD_BONUS: "QUEST_REWARD_BONUS",
    EXTRA_QUEST_SLOT: "EXTRA_QUEST_SLOT",
    QUEST_TIME_EXTENSION: "QUEST_TIME_EXTENSION",
    QUEST_PRIORITY: "QUEST_PRIORITY",
    COMMUNITY_PROGRESS_BONUS: "COMMUNITY_PROGRESS_BONUS",

    // XP
    MESSAGE_XP_BONUS: "MESSAGE_XP_BONUS",
    XP_COOLDOWN_REDUCTION: "XP_COOLDOWN_REDUCTION",

    // Voice
    VOICE_XP_BONUS: "VOICE_XP_BONUS",
    VOICE_TIME_BONUS: "VOICE_TIME_BONUS",
    VOICE_CHANNEL_EFFECTS: "VOICE_CHANNEL_EFFECTS",

    // Streak
    STREAK_SHIELD: "STREAK_SHIELD",
    STREAK_RECOVERY_WINDOW: "STREAK_RECOVERY_WINDOW",
    STREAK_SKIP_DAY: "STREAK_SKIP_DAY",

    // Economy
    POINT_BONUS: "POINT_BONUS",
    POINT_TO_RC_DISCOUNT: "POINT_TO_RC_DISCOUNT",
    SHOP_DISCOUNT: "SHOP_DISCOUNT",
    MARKETPLACE_DISCOUNT: "MARKETPLACE_DISCOUNT",
    TRANSFER_FEE_DISCOUNT: "TRANSFER_FEE_DISCOUNT",
    DOUBLE_DAILY_REWARD: "DOUBLE_DAILY_REWARD",

    // Combo
    COMBO_SCORE_BONUS: "COMBO_SCORE_BONUS",

    // Cosmetics
    PROFILE_BADGE: "PROFILE_BADGE",
    PROFILE_THEME: "PROFILE_THEME",
    ANIMATED_PROFILE: "ANIMATED_PROFILE",
    CUSTOM_BACKGROUND: "CUSTOM_BACKGROUND",
    LEADERBOARD_BADGE: "LEADERBOARD_BADGE",
    CUSTOM_EMOJIS: "CUSTOM_EMOJIS",
} as const;

export type PremiumFeatureKey = typeof PremiumFeature[keyof typeof PremiumFeature];

registerPremiumFeature({
    key: PremiumFeature.VIP_QUEST_ACCESS,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "quests",
    description: "May claim VIP quests",
});

registerPremiumFeature({
    key: PremiumFeature.QUEST_REWARD_BONUS,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "quests",
    description: "Extra points on every quest reward",
});

registerPremiumFeature({
    key: PremiumFeature.EXTRA_QUEST_SLOT,
    // Additive on purpose: an extra slot from two sources really is two extra slots, and this is
    // the one place where "highest wins" would feel like a bug rather than a rule.
    type: "count",
    baseline: 0,
    stacking: "sum",
    module: "quests",
    description: "Additional quests claimable at the same time",
});

registerPremiumFeature({
    key: PremiumFeature.QUEST_TIME_EXTENSION,
    type: "duration",
    baseline: 0,
    stacking: "highest",
    module: "quests",
    description: "Longer to finish a claimed quest",
});

registerPremiumFeature({
    key: PremiumFeature.QUEST_PRIORITY,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "quests",
    description: "Claim a quest before it opens to everyone",
});

registerPremiumFeature({
    key: PremiumFeature.COMMUNITY_PROGRESS_BONUS,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "quests",
    description: "Contributions count for more in the weekly challenge",
});

registerPremiumFeature({
    key: PremiumFeature.MESSAGE_XP_BONUS,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "xp",
    description: "Extra XP from messages",
});

registerPremiumFeature({
    key: PremiumFeature.XP_COOLDOWN_REDUCTION,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "xp",
    description: "Shorter wait between XP-earning messages",
});

registerPremiumFeature({
    key: PremiumFeature.VOICE_XP_BONUS,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "voice",
    description: "Extra XP from voice",
});

registerPremiumFeature({
    key: PremiumFeature.VOICE_TIME_BONUS,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "voice",
    description: "Voice time counts for more toward points",
});

registerPremiumFeature({
    key: PremiumFeature.VOICE_CHANNEL_EFFECTS,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "voice",
    description: "Cosmetic voice effects",
});

registerPremiumFeature({
    key: PremiumFeature.STREAK_SHIELD,
    type: "count",
    baseline: 0,
    stacking: "sum",
    module: "streak",
    description: "Missed days absorbed before a streak breaks",
});

registerPremiumFeature({
    key: PremiumFeature.STREAK_RECOVERY_WINDOW,
    type: "duration",
    baseline: 0,
    stacking: "highest",
    module: "streak",
    description: "Longer window to recover a lapsed streak",
});

registerPremiumFeature({
    key: PremiumFeature.STREAK_SKIP_DAY,
    type: "count",
    baseline: 0,
    stacking: "sum",
    module: "streak",
    description: "Days that may be skipped without claiming",
});

registerPremiumFeature({
    key: PremiumFeature.POINT_BONUS,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "economy",
    description: "Extra points from every activity source",
});

registerPremiumFeature({
    key: PremiumFeature.POINT_TO_RC_DISCOUNT,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "economy",
    description: "Points-to-RC conversion costs less",
});

registerPremiumFeature({
    key: PremiumFeature.SHOP_DISCOUNT,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "economy",
    description: "Cheaper shop purchases",
});

registerPremiumFeature({
    key: PremiumFeature.MARKETPLACE_DISCOUNT,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "economy",
    description: "Cheaper marketplace purchases",
});

registerPremiumFeature({
    key: PremiumFeature.TRANSFER_FEE_DISCOUNT,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "economy",
    description: "Lower fee when transferring currency",
});

registerPremiumFeature({
    key: PremiumFeature.DOUBLE_DAILY_REWARD,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "economy",
    description: "Daily rewards pay twice",
});

registerPremiumFeature({
    key: PremiumFeature.COMBO_SCORE_BONUS,
    type: "percent",
    baseline: 0,
    stacking: "highest",
    module: "combo",
    description: "Combo scores climb faster",
});

registerPremiumFeature({
    key: PremiumFeature.PROFILE_BADGE,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "profile",
    description: "Premium badge on the profile",
});

registerPremiumFeature({
    key: PremiumFeature.PROFILE_THEME,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "profile",
    description: "Custom profile theme",
});

registerPremiumFeature({
    key: PremiumFeature.ANIMATED_PROFILE,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "profile",
    description: "Animated profile decorations",
});

registerPremiumFeature({
    key: PremiumFeature.CUSTOM_BACKGROUND,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "profile",
    description: "Custom profile background",
});

registerPremiumFeature({
    key: PremiumFeature.LEADERBOARD_BADGE,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "profile",
    description: "Badge beside the name on leaderboards",
});

registerPremiumFeature({
    key: PremiumFeature.CUSTOM_EMOJIS,
    type: "flag",
    baseline: false,
    stacking: "highest",
    module: "profile",
    description: "Access to premium-only emojis",
});
