import type { FeatureSubcommandHandler } from "@typings/feature";
import { QUEST_CONFIG_MESSAGES } from "@constants";
import { QuestSettingsRepository } from "@database/repositories";

type ChannelField = "dailyChannelId" | "communityChannelId" | "vipChannelId";

/**
 * The three channel setters differ only by which field they write, so they are one function.
 *
 * `channel` is required on daily and community and optional on VIP — a cleared VIP channel is a
 * meaningful state (fall back to the daily channel), an unset daily channel just means quests are
 * generated and posted nowhere.
 */
const setChannel = (field: ChannelField, describe: (mention: string | null) => string): FeatureSubcommandHandler =>
    async (interaction, _client) => {
        const channel = interaction.options.getChannel("channel");
        await QuestSettingsRepository.setChannel(interaction.guildId!, field, channel?.id ?? null);
        await interaction.editReply({ content: describe(channel ? `<#${channel.id}>` : null) });
    };

export const channelDaily = setChannel("dailyChannelId", QUEST_CONFIG_MESSAGES.channel.daily);

export const channelCommunity = setChannel("communityChannelId", QUEST_CONFIG_MESSAGES.channel.community);

export const channelVip = setChannel("vipChannelId", QUEST_CONFIG_MESSAGES.channel.vip);
