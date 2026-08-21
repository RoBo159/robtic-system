import { PointsRepository } from "@database/repositories";
import { getPointRates } from "./get-point-rates";
import { awardPremiumPointBonus } from "./award-premium-bonus";

/** Adds earned combo score toward the guild's combo-per-point rate. Returns Points just earned. */
export async function awardComboPoint(guildId: string, discordId: string, username: string, scoreGain: number): Promise<number> {
    const rates = await getPointRates(guildId);
    const earned = await PointsRepository.addProgress(guildId, discordId, username, "combo", scoreGain, rates.comboPerPoint);

    return earned + await awardPremiumPointBonus(guildId, discordId, username, earned, "combo");
}
