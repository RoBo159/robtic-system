import { EmbedBuilder } from "discord.js";
import { COLORS, MODERATION_HELP } from "@constants";

export function moderationHelpEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(MODERATION_HELP.title)
        .setColor(COLORS.moderation)
        .addFields(...MODERATION_HELP.fields)
        .setTimestamp();
}
