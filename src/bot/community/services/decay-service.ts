import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { XPSettingsRepository } from "@database/repositories/XPSettingsRepository";
import { DECAY_CONFIG } from "@core/config";
import { calculateLevel, removeLevelRewards } from "./xp-service";
import { Logger } from "@core/libs";
import { logToChannel, decayEmbed } from "../utils/activity-logger";
import type { Client, Guild } from "discord.js";

export async function runDecayCycle(client: Client): Promise<void> {
    for (const [, guild] of client.guilds.cache) {
        await processGuildDecay(guild);
    }
}

async function processGuildDecay(guild: Guild): Promise<void> {
    const settings = await XPSettingsRepository.get(guild.id);
    if (!settings?.decayEnabled) return;

    const threshold = new Date(Date.now() - DECAY_CONFIG.inactiveDaysThreshold * 86_400_000);
    const inactiveUsers = await ActivityRepository.getInactiveUsers(guild.id, threshold);

    for (const user of inactiveUsers) {
        const daysInactive = user.decay.inactiveDays;
        const xpLoss = Math.min(
            DECAY_CONFIG.baseXPLoss + (daysInactive * DECAY_CONFIG.accelerationPerDay),
            DECAY_CONFIG.maxDailyLoss
        );

        const actualLoss = Math.min(xpLoss, user.totalXP);
        if (actualLoss <= 0) continue;

        const newTotalXP = user.totalXP - actualLoss;
        const newLevel = calculateLevel(newTotalXP);
        const levelDown = newLevel < user.level;

        await ActivityRepository.applyDecay(user.discordId, guild.id, actualLoss, newLevel);

        await ActivityLogRepository.log({
            guildId: guild.id,
            userId: user.discordId,
            type: "xp_decay",
            amount: -actualLoss,
            details: `Inactive ${daysInactive + 1} days, lost ${actualLoss} XP`,
        });

        if (levelDown) {
            await ActivityLogRepository.log({
                guildId: guild.id,
                userId: user.discordId,
                type: "level_down",
                amount: newLevel,
                details: `Decayed from level ${user.level} to ${newLevel}`,
            });

            await removeLevelRewards(user.discordId, guild.id, newLevel, guild);
        }

        Logger.debug(
            `Decay: ${user.username} lost ${actualLoss} XP (inactive ${daysInactive + 1}d)`,
            "community"
        );

        await logToChannel(guild, "decay", decayEmbed(
            user.discordId, user.username, actualLoss, levelDown, user.level, newLevel,
        ));
    }
}

let decayInterval: ReturnType<typeof setInterval> | null = null;

export function startDecayScheduler(client: Client): void {
    if (decayInterval) return;
    decayInterval = setInterval(() => {
        runDecayCycle(client).catch(err =>
            Logger.error(`Decay cycle failed: ${err}`, "community")
        );
    }, DECAY_CONFIG.checkIntervalMs);

    Logger.info("XP decay scheduler started", "community");
}

export function stopDecayScheduler(): void {
    if (decayInterval) {
        clearInterval(decayInterval);
        decayInterval = null;
    }
}
