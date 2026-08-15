import type { FeatureSubcommandHandler } from "@typings/feature";
import { ReplyRepository } from "@database/repositories";

export const add: FeatureSubcommandHandler = async (interaction, _client) => {
    const trigger = interaction.options.getString("msg", true).trim();
    const reply = interaction.options.getString("reply", true);

    const doc = await ReplyRepository.addReply(interaction.guildId!, trigger, reply);

    await interaction.editReply({
        content: `Added a reply for **${trigger}** — it now has **${doc.replies.length}**, one picked at random each time.`,
    });
};
