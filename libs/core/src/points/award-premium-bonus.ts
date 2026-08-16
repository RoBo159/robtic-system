import { PointsRepository } from "@database/repositories";
import { getMultiplier, PremiumFeature } from "@core/premium";
import { Logger } from "@logger";

const CTX = "points";

/**
 * Tops up an award with the member's `POINT_BONUS`.
 *
 * Paid as a separate movement rather than by inflating the rate, for three reasons: the progress
 * carry stays exact (a bonus applied before the division would leave fractional remainders that
 * never clear), the ledger shows plainly what was earned and what premium added, and a tier that
 * grants nothing performs no write at all.
 *
 * Never throws. A point award that succeeded must not be undone because a bonus lookup failed.
 */
export async function awardPremiumPointBonus(
    guildId: string,
    discordId: string,
    username: string,
    earned: number,
    source: string,
): Promise<number> {
    if (earned <= 0) return 0;

    try {
        const multiplier = await getMultiplier(guildId, discordId, PremiumFeature.POINT_BONUS);
        const bonus = Math.round(earned * multiplier) - earned;
        if (bonus <= 0) return 0;

        await PointsRepository.move({
            guildId,
            discordId,
            username,
            amount: bonus,
            source: "premium",
            detail: `premium bonus on ${source}`,
        });

        return bonus;
    } catch (err) {
        Logger.warn(`Could not apply premium point bonus for ${discordId}: ${err}`, CTX);
        return 0;
    }
}
