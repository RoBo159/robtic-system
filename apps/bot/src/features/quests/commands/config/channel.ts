import type { FeatureSubcommandHandler } from "@typings/feature";
import { QUEST_CONFIG_MESSAGES } from "@constants";
import { QuestSettingsRepository } from "@database/repositories";

type ChannelField = "questChannelId" | "communityChannelId";

/**
 * Two channels, and both setters differ only by which field they write.
 *
 * There used to be three — daily, community and VIP, the last falling back to daily. Choosing a
 * channel per quest tier scattered one feed across several places and gave every guild a way to
 * post VIP quests where VIP members could not read them. Quests go to one channel now; the
 * community challenge keeps its own because it is a different thing on a different schedule.
 */
const setChannel = (field: ChannelField, describe: (mention: string) => string): FeatureSubcommandHandler =>
    async (interaction, _client) => {
        const channel = interaction.options.getChannel("channel", true);
        await QuestSettingsRepository.setChannel(interaction.guildId!, field, channel.id);
        await interaction.editReply({ content: describe(`<#${channel.id}>`) });
    };

export const channelQuest = setChannel("questChannelId", QUEST_CONFIG_MESSAGES.channel.quest);

export const channelCommunity = setChannel("communityChannelId", QUEST_CONFIG_MESSAGES.channel.community);
