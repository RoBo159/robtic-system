import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
    type ButtonInteraction,
} from "discord.js";
import type { ComponentHandler } from "@typings/command";
import { COLORS } from "@constants";
import { StreakRewardRepository, StreakRewardClaimRepository } from "@database/repositories";

export const streakRewardClaimHandler: ComponentHandler<ButtonInteraction> = {
    customId: /^streak_reward_claim_(\d+)_(\d+)$/,

    async run(interaction: ButtonInteraction) {
        const match = interaction.customId.match(/^streak_reward_claim_(\d+)_(\d+)$/);
        if (!match) return;
        const [, recipientId, thresholdStr] = match;
        const threshold = Number(thresholdStr);

        if (interaction.user.id !== recipientId) {
            await interaction.reply({ content: "هذه المكافأة ليست لك.", flags: MessageFlags.Ephemeral });
            return;
        }

        const guildId = interaction.guildId!;
        const reward = await StreakRewardRepository.get(guildId, threshold);
        if (!reward) {
            await interaction.reply({ content: "لم تعد هذه المكافأة متاحة.", flags: MessageFlags.Ephemeral });
            return;
        }

        const claimed = await StreakRewardClaimRepository.markClaimed(guildId, recipientId, threshold);
        if (!claimed) {
            await interaction.reply({ content: "لقد طالبت بهذه المكافأة بالفعل.", flags: MessageFlags.Ephemeral });
            return;
        }

        const user = await interaction.client.users.fetch(recipientId).catch(() => null);
        if (user) {
            await user.send({
                embeds: [new EmbedBuilder()
                    .setTitle("🎁 تم استلام مكافأتك!")
                    .setColor(COLORS.success)
                    .setDescription(`مكافأتك مقابل **${threshold}** يوم تتابع:\n${reward.offer}`)
                    .setTimestamp()],
            }).catch(() => null);
        }

        await interaction.reply({ content: "✅ تمت المطالبة بالمكافأة! تحقق من رسائلك الخاصة.", flags: MessageFlags.Ephemeral });

        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`streak_reward_claimed_${recipientId}_${threshold}`)
                .setLabel("تمت المطالبة")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("✅")
                .setDisabled(true),
        );
        await interaction.message.edit({ components: [disabledRow] }).catch(() => null);
    },
};
