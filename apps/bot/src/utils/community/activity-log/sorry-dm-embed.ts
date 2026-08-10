import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function sorryDmEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle(COMMUNITY_MESSAGES.sorryDmTitle)
        .setDescription(COMMUNITY_MESSAGES.sorryDmDescription)
        .setTimestamp();
}
