import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_CONFIG_MESSAGES, QUEST_TIERS, type QuestTier } from "@constants";
import { mentionRoleFor, tierEnabled } from "@database/models";
import { QuestSettingsRepository } from "@database/repositories";
import { tierTitle } from "../../utils/quest-lines";

const TEXT = QUEST_CONFIG_MESSAGES.status;

const channel = (id: string | null): string => (id ? `<#${id}>` : TEXT.notSet);

/**
 * The whole configuration on one screen, with the problems called out.
 *
 * The warnings matter more than the values: every one of them is a state where the engine keeps
 * running and quietly achieves nothing, which is exactly the kind of thing nobody notices for a
 * week.
 */
export const status: FeatureSubcommandHandler = async (interaction, _client) => {
    const settings = await QuestSettingsRepository.getCached(interaction.guildId!);
    const clock = QUEST_CONFIG_MESSAGES.utcClock(settings.utcOffsetMinutes);

    const warnings: string[] = [];
    if (!settings.questChannelId) warnings.push(TEXT.warnings.noQuestChannel);
    if (settings.communityEnabled && !settings.communityChannelId) {
        warnings.push(TEXT.warnings.noCommunityChannel);
    }
    if (settings.vipRoleIds.length === 0 && tierEnabled(settings, "vip")) {
        warnings.push(TEXT.warnings.noVipRoles);
    }
    if (settings.windows.filter(window => window.enabled).length === 0) {
        warnings.push(TEXT.warnings.noWindows);
    }

    const embed = new EmbedBuilder()
        .setTitle(TEXT.title)
        .setColor(warnings.length > 0 ? COLORS.warning : COLORS.success)
        .addFields(
            {
                name: TEXT.channelsField,
                value: TEXT.channelsValue(
                    channel(settings.questChannelId),
                    channel(settings.communityChannelId),
                ),
                inline: true,
            },
            {
                name: TEXT.mentionsField,
                value: [...QUEST_TIERS, "community" as const]
                    .map(type => TEXT.mentionRow(
                        type === "community" ? TEXT.communityLabel : tierTitle(type as QuestTier),
                        mentionRoleFor(settings, type),
                    ))
                    .join("\n"),
                inline: true,
            },
            {
                name: TEXT.difficultiesField,
                value: QUEST_TIERS
                    .map(tier => TEXT.difficultyRow(tierEnabled(settings, tier), tierTitle(tier)))
                    .join("\n"),
                inline: true,
            },
            {
                name: TEXT.windowsField(clock),
                value: settings.windows.length > 0
                    ? settings.windows.map(window => TEXT.windowRow(window)).join("\n")
                    : TEXT.none,
                inline: true,
            },
            {
                name: TEXT.vipRolesField,
                value: settings.vipRoleIds.length > 0
                    ? settings.vipRoleIds.map(id => `<@&${id}>`).join(", ")
                    : TEXT.none,
                inline: true,
            },
            {
                name: TEXT.communityField,
                value: settings.communityEnabled
                    ? TEXT.communityOn(settings.communityRewardBase, settings.communityMinContribution)
                    : TEXT.communityOff,
                inline: true,
            },
        );

    if (warnings.length > 0) {
        embed.addFields({ name: TEXT.warningsField, value: warnings.map(TEXT.warningRow).join("\n") });
    }

    await interaction.editReply({ embeds: [embed] });
};
