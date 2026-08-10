import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COLORS } from "@constants";
import { StreakRewardRepository } from "@database/repositories";

export default {
    category: "Streak",
    data: new SlashCommandBuilder()
        .setName("streak-reward")
        .setDescription("إدارة مكافآت التتابع")
        .addSubcommand(sub =>
            sub.setName("add")
                .setDescription("إضافة أو تعديل مكافأة عند الوصول لعدد أيام معين")
                .addIntegerOption(opt => opt.setName("number").setDescription("عدد أيام التتابع المطلوب").setRequired(true).setMinValue(1))
                .addStringOption(opt => opt.setName("offer").setDescription("وصف المكافأة").setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("إزالة مكافأة")
                .addIntegerOption(opt => opt.setName("number").setDescription("عدد أيام التتابع").setRequired(true).setMinValue(1))
        )
        .addSubcommand(sub =>
            sub.setName("list")
                .setDescription("عرض جميع مكافآت التتابع المُعدة")
        ),

    requiredPermission: 80,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guildId = interaction.guildId!;
        const sub = interaction.options.getSubcommand();

        if (sub === "add") {
            const number = interaction.options.getInteger("number", true);
            const offer = interaction.options.getString("offer", true);
            await StreakRewardRepository.add(guildId, number, offer, interaction.user.id);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(COLORS.success)
                    .setDescription(`✅ عند وصول العضو إلى **${number}** يوم تتابع سيحصل على: ${offer}`)],
            });
            return;
        }

        if (sub === "remove") {
            const number = interaction.options.getInteger("number", true);
            const removed = await StreakRewardRepository.remove(guildId, number);

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(removed ? COLORS.success : COLORS.error)
                    .setDescription(removed ? `✅ تمت إزالة مكافأة **${number}** يوم.` : `❌ لا توجد مكافأة عند **${number}** يوم.`)],
            });
            return;
        }

        // sub === "list"
        const rewards = await StreakRewardRepository.list(guildId);
        if (!rewards.length) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription("لا توجد مكافآت تتابع مُعدة بعد.")],
            });
            return;
        }

        const lines = rewards.map(r => `**${r.threshold}** يوم — ${r.offer}`).join("\n");
        await interaction.editReply({
            embeds: [new EmbedBuilder().setTitle("🎁 مكافآت التتابع").setDescription(lines).setColor(COLORS.info)],
        });
    },
};
