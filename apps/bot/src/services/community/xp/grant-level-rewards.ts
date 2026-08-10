import type { Guild } from "discord.js";
import { LevelRewardRepository } from "@database/repositories/LevelRewardRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { Logger } from "@logger";

const CTX = "community:xp";

export async function grantLevelRewards(
    discordId: string,
    guildId: string,
    level: number,
    guild: Guild
): Promise<void> {
    const rewards = await LevelRewardRepository.getUpToLevel(guildId, level);
    Logger.debug(`Level rewards for level ${level}: ${rewards.length} found`, CTX);
    if (rewards.length === 0) return;

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) {
        Logger.debug(`Could not fetch member ${discordId} for reward grant`, CTX);
        return;
    }

    for (const reward of rewards) {
        if (!member.roles.cache.has(reward.roleId)) {
            Logger.debug(`Granting reward role ${reward.roleId} (level ${reward.level}) to ${discordId}`, CTX);
            await member.roles.add(reward.roleId).catch(() => null);
            await ActivityLogRepository.log({
                guildId,
                userId: discordId,
                type: "reward_granted",
                amount: reward.level,
                details: `Granted role ${reward.roleId} for reaching level ${reward.level}`,
            });
        }
    }
}
