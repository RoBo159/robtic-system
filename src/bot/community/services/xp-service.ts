import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { XPSettingsRepository } from "@database/repositories/XPSettingsRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { LevelRewardRepository } from "@database/repositories/LevelRewardRepository";
import { XP_CONFIG } from "@core/config";
import { Logger } from "@core/libs";
import { analyzeActivity } from "@core/ai";
import type { GuildMember, Guild } from "discord.js";

const CTX = "community:xp";

export function calculateLevel(totalXP: number): number {
    return Math.floor(totalXP / XP_CONFIG.levelMultiplier);
}

export function xpForLevel(level: number): number {
    return level * XP_CONFIG.levelMultiplier;
}

export function randomXP(): number {
    return Math.floor(Math.random() * (XP_CONFIG.maxPerMessage - XP_CONFIG.minPerMessage + 1)) + XP_CONFIG.minPerMessage;
}

export async function isXPChannel(guildId: string, channelId: string): Promise<boolean> {
    const settings = await XPSettingsRepository.get(guildId);
    if (!settings) {
        Logger.debug(`No XP settings found for guild ${guildId}`, CTX);
        return false;
    }
    const result = settings.chatChannels.includes(channelId);
    Logger.debug(`Channel ${channelId} isXPChannel: ${result}`, CTX);
    return result;
}

export async function hasAllowedRole(guildId: string, member: GuildMember): Promise<boolean> {
    const settings = await XPSettingsRepository.get(guildId);
    if (!settings || settings.allowedRoles.length === 0) return true;
    return member.roles.cache.some(r => settings.allowedRoles.includes(r.id));
}

export function isOnXPCooldown(lastGrant: Date): boolean {
    return Date.now() - lastGrant.getTime() < XP_CONFIG.cooldownMs;
}

export async function grantXP(
    discordId: string,
    guildId: string,
    username: string,
    guild: Guild,
    messageContent?: string,
): Promise<{ xp: number; leveledUp: boolean; newLevel: number } | null> {
    if (messageContent) {
        const analysis = await analyzeActivity(messageContent);
        if (!analysis.meaningful && analysis.confidence >= 0.7) {
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

async function grantLevelRewards(
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
