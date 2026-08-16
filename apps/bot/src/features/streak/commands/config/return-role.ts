import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { StreakSettingsRepository } from "@database/repositories";

/** Roles allowed to run `/streak-return`, on top of administrators. */
export const returnRoleAdd: FeatureSubcommandHandler = async (interaction, _client) => {
    const role = interaction.options.getRole("role", true);
    await StreakSettingsRepository.editReturnRole(interaction.guildId!, role.id, "add");
    await interaction.editReply({ content: `${role} can now return streaks.` });
};

export const returnRoleRemove: FeatureSubcommandHandler = async (interaction, _client) => {
    const role = interaction.options.getRole("role", true);
    await StreakSettingsRepository.editReturnRole(interaction.guildId!, role.id, "remove");
    await interaction.editReply({ content: `${role} can no longer return streaks.` });
};

export const returnRoleList: FeatureSubcommandHandler = async (interaction, _client) => {
    const settings = await StreakSettingsRepository.get(interaction.guildId!);
    const roles = settings?.returnRoleIds ?? [];

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("Roles that may return streaks")
            .setColor(COLORS.info)
            .setDescription(roles.length ? roles.map(id => `<@&${id}>`).join("\n") : "None — administrators only.")],
    });
};
