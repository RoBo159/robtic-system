import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { QuestSettingsRepository } from "@database/repositories";

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

    await interaction.editReply({
        content: `<@&${role.id}> can now claim VIP quests — ${settings.vipRoleIds.length} VIP role(s) configured.`,
    });
};

export const vipRoleRemove: FeatureSubcommandHandler = async (interaction, _client) => {
    const role = interaction.options.getRole("role", true);
    const settings = await QuestSettingsRepository.editVipRole(interaction.guildId!, role.id, "remove");

    await interaction.editReply({
        content: settings.vipRoleIds.length === 0
            ? `<@&${role.id}> removed. With no VIP roles left, nobody can claim VIP quests.`
            : `<@&${role.id}> can no longer claim VIP quests.`,
    });
};

export const vipRoleList: FeatureSubcommandHandler = async (interaction, _client) => {
    const settings = await QuestSettingsRepository.getCached(interaction.guildId!);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("VIP roles")
            .setColor(COLORS.info)
            .setDescription(settings.vipRoleIds.length > 0
                ? settings.vipRoleIds.map(id => `• <@&${id}>`).join("\n")
                : "No VIP roles configured, so VIP quests cannot be claimed by anyone.\n" +
                  "Add one with `/quest-config vip-role add`.")],
    });
};
