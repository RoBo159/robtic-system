import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { StreakRepository, StreakRewardRepository, StreakRewardClaimRepository } from "@database/repositories";

export const check: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.deferReply();

    const target = interaction.options.getUser("user") ?? interaction.user;
    const guildId = interaction.guildId!;

    const rewards = await StreakRewardRepository.list(guildId);
    if (!rewards.length) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription("لا توجد مكافآت تتابع مُعدة لهذا السيرفر.")],
        });
        return;
    }

    const record = await StreakRepository.findOrCreate(target.id, guildId, target.username);
    const claims = await StreakRewardClaimRepository.findForUser(guildId, target.id);
    const claimByThreshold = new Map(claims.map(c => [c.threshold, c]));

    const lines = rewards.map(r => {
        const claim = claimByThreshold.get(r.threshold);
        let status: string;
        if (claim?.claimed) status = "✅ تمت المطالبة";
        else if (claim) status = "⏳ لم تتم المطالبة بعد";
        else if (record.currentStreak >= r.threshold) status = "📢 بانتظار الإعلان";
        else status = "🔒 لم يصل بعد";
        return `**${r.threshold}** يوم — ${r.offer} — ${status}`;
    });

    const embed = new EmbedBuilder()
        .setTitle(`🎁 حالة مكافآت التتابع — ${target.username}`)
        .setDescription(`التتابع الحالي: 🔥 ${record.currentStreak}\n\n${lines.join("\n")}`)
        .setColor(COLORS.activity)
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
};
