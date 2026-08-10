import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function staffReminderEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.warning)
        .setTitle(COMMUNITY_MESSAGES.staffReminderTitle)
        .setDescription(COMMUNITY_MESSAGES.staffReminderDescription)
        .setTimestamp();
}
