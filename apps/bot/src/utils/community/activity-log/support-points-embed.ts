import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function supportPointsEmbed(staffId: string, points: number, responseMs: number): EmbedBuilder {
    const seconds = Math.round(responseMs / 1000);
    return new EmbedBuilder()
        .setColor(points >= 0 ? COLORS.success : COLORS.error)
        .setTitle(points >= 0 ? COMMUNITY_MESSAGES.supportPointsTitle : COMMUNITY_MESSAGES.supportPenaltyTitle)
        .addFields(
            { name: "Staff", value: `<@${staffId}>`, inline: true },
            { name: "Points", value: `${points > 0 ? "+" : ""}${points}`, inline: true },
            { name: "Response Time", value: `${seconds}s`, inline: true },
        )
        .setTimestamp();
}
