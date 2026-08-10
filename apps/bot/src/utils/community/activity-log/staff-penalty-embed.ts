import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function staffPenaltyEmbed(staffId: string, points: number, reason: string): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle(COMMUNITY_MESSAGES.staffPenaltyTitle)
        .addFields(
            { name: "Staff", value: `<@${staffId}>`, inline: true },
            { name: "Points", value: `${points}`, inline: true },
            { name: "Reason", value: reason },
        )
        .setTimestamp();
}
