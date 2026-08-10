import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function claimWarningEmbed(channelId: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle(COMMUNITY_MESSAGES.claimWarningTitle)
        .setDescription(COMMUNITY_MESSAGES.claimWarningDescription(channelId))
        .setTimestamp();
}
