import type { FeatureSubcommandHandler } from "@typings/feature";
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

export const channelDaily = setChannel(
    "dailyChannelId",
    mention => `Easy, normal, hard and golden quests will be posted in ${mention}.`
);

export const channelCommunity = setChannel(
    "communityChannelId",
    mention => `The weekly community challenge will be posted in ${mention}.\n` +
        "The panel is posted once and edited all week — it is worth a channel members can find.",
);

export const channelVip = setChannel(
    "vipChannelId",
    mention => mention
        ? `VIP quests will be posted in ${mention}.`
        : "VIP channel cleared — VIP quests will go to the daily quest channel.",
);
