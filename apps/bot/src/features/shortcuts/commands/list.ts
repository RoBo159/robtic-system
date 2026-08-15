import type { FeatureSubcommandHandler } from "@typings/feature";
import { ShortcutRepository } from "@database/repositories";
import { buildShortcutListEmbed } from "../utils/build-shortcut-embed";

export const list: FeatureSubcommandHandler = async (interaction, _client) => {
    const shortcuts = await ShortcutRepository.list(interaction.guildId!);
    await interaction.editReply({ embeds: [buildShortcutListEmbed(shortcuts)] });
};
