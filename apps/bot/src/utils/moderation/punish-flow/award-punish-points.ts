import type { PunishType } from "@typings/punishment";
import { PunishConfigRepository, ActivityRepository } from "@database/repositories";

/** Only warn/mute award moderator points (per product decision — ban does not). */
export async function awardPunishPoints(
    guildId: string,
    moderatorId: string,
    moderatorUsername: string,
    type: PunishType,
): Promise<void> {
    if (type !== "warn" && type !== "mute") return;
    const config = await PunishConfigRepository.getCached(guildId);
    if (config.pointsPerAction <= 0) return;
    await ActivityRepository.addModerationPoints(moderatorId, guildId, moderatorUsername, config.pointsPerAction);
}
