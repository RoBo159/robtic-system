import type { Guild } from "discord.js";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { PeriodicStatRepository } from "@database/repositories/PeriodicStatRepository";
import { AI_MEANINGFUL_SKIP_CONFIDENCE } from "@constants";
import { Logger } from "@logger";
import { analyzeActivity } from "@core/ai";
import { calculateLevel } from "@core/xp";
import { randomXP } from "./random-xp";
import { isOnXPCooldown } from "./is-on-xp-cooldown";
import { grantLevelRewards } from "./grant-level-rewards";

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

    await PeriodicStatRepository.incrementAllPeriods(guildId, "xp", discordId, xp);

    const newLevel = calculateLevel(updated.totalXP);
    const leveledUp = newLevel > record.level;

    if (leveledUp) {
        Logger.debug(`${username} leveled up: ${record.level} → ${newLevel} (totalXP: ${updated.totalXP})`, CTX);
        await ActivityRepository.updateLevel(discordId, guildId, newLevel);
        await ActivityLogRepository.log({
            guildId,
            userId: discordId,
            type: "level_up",
            amount: newLevel,
            details: `Leveled up from ${record.level} to ${newLevel}`,
        });
        await grantLevelRewards(discordId, guildId, newLevel, guild);
    }

    await ActivityLogRepository.log({
        guildId,
        userId: discordId,
        type: "xp_gain",
        amount: xp,
    });

    return { xp, leveledUp, newLevel };
}
