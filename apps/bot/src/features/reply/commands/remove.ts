import type { FeatureSubcommandHandler } from "@typings/feature";
import { ReplyRepository } from "@database/repositories";

export const remove: FeatureSubcommandHandler = async (interaction, _client) => {
    const trigger = interaction.options.getString("msg", true).trim();
    const deleted = await ReplyRepository.deleteReply(interaction.guildId!, trigger);

    await interaction.editReply({
        content: deleted
            ? `Deleted **${trigger}** and its ${deleted.replies.length} repl${deleted.replies.length === 1 ? "y" : "ies"}.`
            : `No trigger called **${trigger}**.`,
    });
};
