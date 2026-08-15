import { PointsRepository } from "@database/repositories";
import { getPointRates } from "./get-point-rates";

/**
 * Adds active voice minutes toward the guild's voice rate. Returns Points just earned.
 *
 * Only *active* minutes are passed in — time spent AFK or alone-and-idle never reaches here, so
 * the rate can be read as "minutes of real participation".
 */
export async function awardVoicePoint(guildId: string, discordId: string, username: string, activeMinutes: number): Promise<number> {
    const rates = await getPointRates(guildId);
    return PointsRepository.addProgress(guildId, discordId, username, "voice", activeMinutes, rates.voiceMinutesPerPoint);
}
