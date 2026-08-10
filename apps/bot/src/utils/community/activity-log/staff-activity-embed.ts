import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function staffActivityEmbed(userId: string, username: string, points: number, channelType: "public" | "staff"): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.activity)
        .setTitle(COMMUNITY_MESSAGES.staffActivityTitle(channelType))
        .addFields(
            { name: "Staff", value: `<@${userId}>`, inline: true },
            { name: "Points", value: `+${points}`, inline: true },
        )
        .setTimestamp();
}
