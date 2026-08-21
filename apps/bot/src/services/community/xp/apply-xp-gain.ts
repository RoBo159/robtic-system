import type { Guild } from "discord.js";
import { ActivityRepository, ActivityLogRepository, PeriodicStatRepository } from "@database/repositories";
import type { IActivityXP } from "@database/models";
import { calculateLevel } from "@core/xp";
import { publishMetric } from "@core/metrics";
import { Logger } from "@logger";
import { announceLevelUp } from "./announce-level-up";
import { grantLevelRewards } from "./grant-level-rewards";

export interface XpGainResult {
    xp: number;
    leveledUp: boolean;
    newLevel: number;
}

/**
 * Everything that happens *after* XP lands on the record, shared by every source.
 *
 * Chat and voice differ only in how they decide to award and how the total is written — the
 * level maths, the level-up rewards, the announcement and the logs are the same, and there is one
 * level system rather than one per source. Keeping this in a single place is what stops voice
 * quietly growing its own copy that drifts.
 */
export async function applyXpGain(
    discordId: string,
    guildId: string,
    username: string,
    guild: Guild,
    xp: number,
    previousLevel: number,
    updated: IActivityXP,
    ctx: string,
): Promise<XpGainResult> {
    await PeriodicStatRepository.incrementAllPeriods(guildId, "xp", discordId, xp);

    publishMetric({ guildId, discordId, username, metric: "xp", value: xp });

    const newLevel = calculateLevel(updated.totalXP);
    const leveledUp = newLevel > previousLevel;

    if (leveledUp) {
        publishMetric({ guildId, discordId, username, metric: "levelUp", value: newLevel - previousLevel });

        Logger.debug(`${username} leveled up: ${previousLevel} → ${newLevel} (totalXP: ${updated.totalXP})`, ctx);

        await ActivityRepository.updateLevel(discordId, guildId, newLevel);
        await ActivityLogRepository.log({
            guildId,
            userId: discordId,
            type: "level_up",
            amount: newLevel,
            details: `Leveled up from ${previousLevel} to ${newLevel}`,
        });

        await grantLevelRewards(discordId, guildId, newLevel, guild);
        await announceLevelUp(guild, discordId, newLevel);
    }

    await ActivityLogRepository.log({ guildId, userId: discordId, type: "xp_gain", amount: xp });

    return { xp, leveledUp, newLevel };
}
