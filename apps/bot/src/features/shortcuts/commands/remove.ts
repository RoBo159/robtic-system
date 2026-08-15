import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { ShortcutRepository } from "@database/repositories";

export const remove: FeatureSubcommandHandler = async (interaction, _client) => {
    const trigger = interaction.options.getString("trigger", true).trim();
    const removed = await ShortcutRepository.remove(interaction.guildId!, trigger);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(removed ? COLORS.success : COLORS.error)
            .setDescription(removed ? `Removed **${removed.trigger}**.` : `No shortcut called **${trigger}**.`)],
    });
};
