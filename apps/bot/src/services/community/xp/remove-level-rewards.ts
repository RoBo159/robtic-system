import type { Guild } from "discord.js";
import { LevelRewardRepository } from "@database/repositories/LevelRewardRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";

export async function removeLevelRewards(
    discordId: string,
    guildId: string,
    newLevel: number,
    guild: Guild
): Promise<void> {
    const allRewards = await LevelRewardRepository.getAll(guildId);
    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) return;

    for (const reward of allRewards) {
        if (reward.level > newLevel && member.roles.cache.has(reward.roleId)) {
            await member.roles.remove(reward.roleId).catch(() => null);
            await ActivityLogRepository.log({
                guildId,
                userId: discordId,
                type: "reward_removed",
                amount: reward.level,
                details: `Removed role ${reward.roleId} (level ${reward.level} > current ${newLevel})`,
            });
        }
    }
}
