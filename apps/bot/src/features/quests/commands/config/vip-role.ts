import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_CONFIG_MESSAGES } from "@constants";
import { QuestSettingsRepository } from "@database/repositories";

const TEXT = QUEST_CONFIG_MESSAGES.vipRole;

/**
 * Any one of these roles is enough to claim a VIP quest.
 *
 * A list rather than a single role because servers name their tiers differently — Prime, Prime+,
 * Premium, VIP, Lifetime can all sit here side by side without the engine knowing what any of them
 * mean.
 */
export const vipRoleAdd: FeatureSubcommandHandler = async (interaction, _client) => {
    const role = interaction.options.getRole("role", true);
    const settings = await QuestSettingsRepository.editVipRole(interaction.guildId!, role.id, "add");

    await interaction.editReply({ content: TEXT.added(role.id, settings.vipRoleIds.length) });
};

export const vipRoleRemove: FeatureSubcommandHandler = async (interaction, _client) => {
    const role = interaction.options.getRole("role", true);
    const settings = await QuestSettingsRepository.editVipRole(interaction.guildId!, role.id, "remove");

    await interaction.editReply({
        content: settings.vipRoleIds.length === 0 ? TEXT.removedLast(role.id) : TEXT.removed(role.id),
    });
};

export const vipRoleList: FeatureSubcommandHandler = async (interaction, _client) => {
    const settings = await QuestSettingsRepository.getCached(interaction.guildId!);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle(TEXT.listTitle)
            .setColor(COLORS.info)
            .setDescription(settings.vipRoleIds.length > 0
                ? settings.vipRoleIds.map(TEXT.listRow).join("\n")
                : TEXT.listEmpty)],
    });
};
