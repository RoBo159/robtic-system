import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, STREAK_CONFIG } from "@constants";
import { StreakRepository, StreakRecoveryRepository } from "@database/repositories";
import { applyStreakRole } from "../../utils/streak-role";

/** The staff-facing counterpart to `/streak-return`: restores someone else's expired streak. */
export const restore: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const user = interaction.options.getUser("user", true);
    const recovery = await StreakRecoveryRepository.find(user.id, guildId);

    if (!recovery) {
        await interaction.editReply({ content: `لا يوجد تتابع قابل للاسترجاع لـ ${user}.` });
        return;
    }

    const withinWindow = Date.now() - recovery.expiredAt.getTime() <= STREAK_CONFIG.recoveryWindowMs;
    if (!withinWindow) {
        await interaction.editReply({ content: `انتهت مدة استرجاع تتابع ${user}.` });
        return;
    }

    await StreakRepository.restore(user.id, guildId, recovery.currentStreak, recovery.bestStreak);
    await StreakRecoveryRepository.delete(user.id, guildId);

    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    if (member) {
        await applyStreakRole(member, recovery.currentStreak).catch(() => null);
    }

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("✅ تم استرجاع التتابع")
            .setColor(COLORS.success)
            .setDescription(`تم استرجاع تتابع ${user} إلى **${recovery.currentStreak}** (الأفضل **${recovery.bestStreak}**).`)],
    });
};
