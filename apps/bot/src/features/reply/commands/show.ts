import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { ReplyRepository } from "@database/repositories";
import { toReplyEntries } from "@database/models";

export const show: FeatureSubcommandHandler = async (interaction, _client) => {
    const trigger = interaction.options.getString("msg", true).trim();
    const doc = await ReplyRepository.getReply(interaction.guildId!, trigger);

    if (!doc) {
        await interaction.editReply({ content: `No trigger called **${trigger}**.` });
        return;
    }

    const entries = toReplyEntries(doc.replies);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle(`Replies for: ${doc.trigger}`)
            .setColor(COLORS.info)
            .setDescription(
                entries
                    .map(entry => `\`${entry.id}\` ${entry.text}\n╰ added by ${entry.createdBy ? `<@${entry.createdBy}>` : "*unknown*"}`)
                    .join("\n")
                    .slice(0, 4096) || "*no replies*"
            )
            .setFooter({ text: "One is chosen at random each time the trigger fires." })],
    });
};
