import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function claimTakeoverEmbed(channelId: string, originalStaffId: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(COMMUNITY_MESSAGES.claimTakeoverTitle)
        .setDescription(COMMUNITY_MESSAGES.claimTakeoverDescription(channelId, originalStaffId))
        .setTimestamp();
}
