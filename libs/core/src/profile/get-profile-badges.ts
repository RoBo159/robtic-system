import { getBenefits, PremiumFeature } from "@core/premium";
import type { ProfileBadge } from "@typings/profile";
import { BADGE_FIRE_RANGES } from "@constants";
import { getTopEntries } from "../leaderboard/get-top-entries";

/**
 * Achievement badges shown next to the profile name: a fire tier matching the current streak
 * (mirrors the images/streak fire icons) plus crowns for holding the server's #1 combo/streak.
 */
export async function getProfileBadges(
    guildId: string,
    targetId: string,
    currentStreak: number,
): Promise<ProfileBadge[]> {
    const badges: ProfileBadge[] = [];

    const tier = BADGE_FIRE_RANGES.find(range => currentStreak >= range.min && currentStreak <= range.max)
        // Streaks past the last tier keep its badge.
        ?? (currentStreak > 0 ? BADGE_FIRE_RANGES[BADGE_FIRE_RANGES.length - 1] : undefined);
    if (tier) {
        badges.push({ id: `fire${tier.min}-${tier.max}`, label: `${currentStreak}-day streak` });
    }

    const [topCombo, topStreak] = await Promise.all([
        getTopEntries(guildId, "combo", "alltime", 1),
        getTopEntries(guildId, "streak", "alltime", 1),
    ]);
    if (topCombo[0]?.discordId === targetId) {
        badges.push({ id: "top-combo", label: "Top combo on the server" });
    }
    if (topStreak[0]?.discordId === targetId) {
        badges.push({ id: "top-streak", label: "Top streak on the server" });
    }

    // The badge is a *perk*, not a role read: whether it shows is `PROFILE_BADGE` on whatever tier
    // this member holds, which is why a server can grant a tier that pays bonuses without also
    // advertising it, and vice versa.
    const benefits = await getBenefits(guildId, targetId);
    if (benefits.tier && benefits.values[PremiumFeature.PROFILE_BADGE] === true) {
        badges.push({ id: `premium-${benefits.tier.key}`, label: `${benefits.tier.emoji} ${benefits.tier.name}` });
    }

    return badges;
}
