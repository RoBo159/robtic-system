import type { FeatureSubcommandHandler } from "@typings/feature";
import { ReplyRepository } from "@database/repositories";

export const add: FeatureSubcommandHandler = async (interaction, _client) => {
    const trigger = interaction.options.getString("msg", true).trim();
    const text = interaction.options.getString("reply", true);

    const { doc, entry } = await ReplyRepository.addReply(
        interaction.guildId!,
        trigger,
        text,
        interaction.user.id,
    );

    const count = doc.replies.length;

    await interaction.editReply({
        content:
            `Added reply \`${entry.id}\` for **${trigger}** — it now has **${count}**, ` +
            `one picked at random each time.\n` +
            `Remove just this one with \`/reply remove id:${entry.id}\`.`,
    });
};
