import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function ratingFeedbackEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle(COMMUNITY_MESSAGES.ratingFeedbackTitle)
        .setDescription(COMMUNITY_MESSAGES.ratingFeedbackDescription)
        .setTimestamp();
}
