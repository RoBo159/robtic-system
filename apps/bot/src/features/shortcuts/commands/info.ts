import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { ShortcutRepository } from "@database/repositories";
import { buildShortcutInfoEmbed } from "../utils/build-shortcut-embed";

export const info: FeatureSubcommandHandler = async (interaction, _client) => {
    const trigger = interaction.options.getString("trigger", true).trim();
    const shortcut = await ShortcutRepository.find(interaction.guildId!, trigger);

    if (!shortcut) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(`No shortcut called **${trigger}**.`)],
        });
        return;
    }

    await interaction.editReply({ embeds: [buildShortcutInfoEmbed(shortcut)] });
};
