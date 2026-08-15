import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { ReplyRepository } from "@database/repositories";

export const show: FeatureSubcommandHandler = async (interaction, _client) => {
    const trigger = interaction.options.getString("msg", true).trim();
    const doc = await ReplyRepository.getReply(interaction.guildId!, trigger);

    if (!doc) {
        await interaction.editReply({ content: `No trigger called **${trigger}**.` });
        return;
    }

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle(`Replies for: ${trigger}`)
            .setColor(COLORS.info)
            .setDescription(doc.replies.map(r => `• ${r}`).join("\n"))
            .setFooter({ text: "One is chosen at random each time the trigger fires." })],
    });
};
