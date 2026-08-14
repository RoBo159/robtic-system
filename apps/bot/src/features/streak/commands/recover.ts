import { EmbedBuilder, MessageFlags, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { StreakRepository, StreakRecoveryRepository } from "@database/repositories";
import { COLORS, STREAK_CONFIG } from "@constants";
import { getUserLang, t } from "@bot/utils/lang";
import { applyStreakRole } from "../utils/streak-role";

export const recover: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId!;
    const userId = interaction.user.id;
    const lang = await getUserLang(interaction.member as GuildMember | null);

    const recovery = await StreakRecoveryRepository.find(userId, guildId);
    if (!recovery) {
        await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(t("streak.return_nothing", lang)).setColor(COLORS.info)] });
        return;
    }

    const withinWindow = Date.now() - recovery.expiredAt.getTime() <= STREAK_CONFIG.recoveryWindowMs;
    if (!withinWindow) {
        await interaction.editReply({ embeds: [new EmbedBuilder().setDescription(t("streak.return_expired", lang)).setColor(COLORS.warning)] });
        return;
    }

    const current = await StreakRepository.findOrCreate(userId, guildId, interaction.user.username);

    if (recovery.currentStreak <= current.currentStreak) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setDescription(
                t("streak.return_not_needed", lang, { current: `${current.currentStreak}`, last: `${recovery.currentStreak}` })
            ).setColor(COLORS.info)],
        });
        return;
    }

    const bestStreak = Math.max(recovery.bestStreak, current.bestStreak);
    await StreakRepository.restore(userId, guildId, recovery.currentStreak, bestStreak);
    await StreakRecoveryRepository.delete(userId, guildId);

    const member = interaction.guild?.members.cache.get(userId) ?? await interaction.guild?.members.fetch(userId).catch(() => null);
    if (member) await applyStreakRole(member, recovery.currentStreak).catch(() => null);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setDescription(t("streak.return_success", lang, { streak: `${recovery.currentStreak}` }))
            .setColor(COLORS.success)],
    });
};
