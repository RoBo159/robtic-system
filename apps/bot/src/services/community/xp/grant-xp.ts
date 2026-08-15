import type { Guild } from "discord.js";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { AI_MEANINGFUL_SKIP_CONFIDENCE } from "@constants";
import { Logger } from "@logger";
import { analyzeActivity } from "@core/ai";
import { applyXpGain } from "./apply-xp-gain";
import { randomXP } from "./random-xp";
import { isOnXPCooldown } from "./is-on-xp-cooldown";

const CTX = "community:xp";

export async function grantXP(
    discordId: string,
    guildId: string,
    username: string,
    guild: Guild,
    messageContent?: string,
): Promise<{ xp: number; leveledUp: boolean; newLevel: number } | null> {
    if (messageContent) {
        const analysis = await analyzeActivity(messageContent);
        if (!analysis.meaningful && analysis.confidence >= AI_MEANINGFUL_SKIP_CONFIDENCE) {
            Logger.debug(
                `${username} XP skipped by AI: not meaningful (conf=${analysis.confidence.toFixed(2)}, fallback=${analysis.fallback}, reason=${analysis.reason ?? "none"})`,
                CTX,
            );
            return null;
        }
    }

    const record = await ActivityRepository.findOrCreate(discordId, guildId, username);

    if (isOnXPCooldown(record.lastXPGrant)) {
        Logger.debug(`${username} (${discordId}) on XP cooldown, skipping`, CTX);
        return null;
    }

    const xp = randomXP();
    Logger.debug(`Granting ${xp} XP to ${username} (${discordId})`, CTX);
    const updated = await ActivityRepository.addXP(discordId, guildId, xp);
    if (!updated) {
        Logger.debug(`Failed to update XP for ${username} (${discordId})`, CTX);
        return null;
    }

    return applyXpGain(discordId, guildId, username, guild, xp, record.level, updated, CTX);
}
