import { PointsRepository } from "@database/repositories";
import { getPointRates } from "./get-point-rates";
import { awardPremiumPointBonus } from "./award-premium-bonus";

/** Counts one real message toward the guild's messages-per-point rate. Returns Points just earned. */
export async function awardMessagePoint(guildId: string, discordId: string, username: string): Promise<number> {
    const rates = await getPointRates(guildId);
    const earned = await PointsRepository.addProgress(guildId, discordId, username, "message", 1, rates.messagesPerPoint);

    // Premium tops up the whole units, never the progress, so the carry stays exact.
    return earned + await awardPremiumPointBonus(guildId, discordId, username, earned, "messages");
}
