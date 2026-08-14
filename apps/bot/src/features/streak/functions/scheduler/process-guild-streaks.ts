import { EmbedBuilder, type Client, type Guild } from "discord.js";
import { StreakRepository, StreakSettingsRepository, StreakRecoveryRepository } from "@database/repositories";
import { COLORS, STREAK_CONFIG, STREAK_DM_MESSAGES } from "@constants";
import { Logger } from "@logger";
import { isStreakExpired } from "@core/streak/is-streak-expired";
import { streakExpiresAt } from "@core/streak/streak-expires-at";
import { applyStreakRole } from "../../utils/streak-role";

const CTX = "main:streak-scheduler";

export async function processGuildStreaks(client: Client, guild: Guild): Promise<void> {
    const settings = await StreakSettingsRepository.get(guild.id);
    const now = new Date();
    const active = await StreakRepository.findAllActive(guild.id);

    for (const streak of active) {
        if (isStreakExpired(streak.lastIncrement, now)) {
            await StreakRecoveryRepository.create(streak.discordId, guild.id, streak.currentStreak, streak.bestStreak);
            await StreakRepository.expire(streak.discordId, guild.id);

            const member = await guild.members.fetch(streak.discordId).catch(() => null);
            if (member) await applyStreakRole(member, 0);

            const user = member?.user ?? await client.users.fetch(streak.discordId).catch(() => null);
            if (user) {
                const embed = new EmbedBuilder()
                    .setDescription(STREAK_DM_MESSAGES.expired(streak.currentStreak))
                    .setColor(COLORS.error)
                    .setTimestamp();

                await user.send({ embeds: [embed] }).catch(() => null);
            }

            Logger.debug(`Expired streak for ${streak.discordId} in ${guild.id} (lost ${streak.currentStreak})`, CTX);
            continue;
        }

        if (!settings?.remindersEnabled || streak.reminderSent) continue;

        const msUntilExpire = streakExpiresAt(streak.lastIncrement).getTime() - now.getTime();
        if (msUntilExpire > STREAK_CONFIG.reminderThresholdMs) continue;

        const user = await client.users.fetch(streak.discordId).catch(() => null);
        if (user) {
            const embed = new EmbedBuilder()
                .setDescription(STREAK_DM_MESSAGES.expiringSoon)
                .setColor(COLORS.warning)
                .setTimestamp();

            await user.send({ embeds: [embed] }).catch(() => null);
        }

        await StreakRepository.markReminderSent(streak.discordId, guild.id);
        Logger.debug(`Sent expiry reminder to ${streak.discordId} in ${guild.id}`, CTX);
    }

    const recoveryCutoff = new Date(now.getTime() - STREAK_CONFIG.recoveryWindowMs);
    await StreakRecoveryRepository.deleteOlderThan(guild.id, recoveryCutoff);
}
