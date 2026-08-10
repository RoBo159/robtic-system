import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function dynamicSupportPointsEmbed(
    staffId: string,
    total: number,
    speedPts: number,
    qualityPts: number,
    sentimentPts: number,
    quality: string | null,
    sentiment: string | null,
    responseMs: number,
): EmbedBuilder {
    const seconds = Math.round(responseMs / 1000);
    return new EmbedBuilder()
        .setColor(total >= 0 ? COLORS.success : COLORS.error)
        .setTitle(total >= 0 ? COMMUNITY_MESSAGES.dynamicSupportPointsTitle : COMMUNITY_MESSAGES.dynamicSupportPenaltyTitle)
        .addFields(
            { name: "Staff", value: `<@${staffId}>`, inline: true },
            { name: "Total", value: `${total > 0 ? "+" : ""}${total}`, inline: true },
            { name: "Response", value: `${seconds}s → ${speedPts > 0 ? "+" : ""}${speedPts}`, inline: true },
            { name: "Quality", value: `${quality ?? "N/A"} → ${qualityPts > 0 ? "+" : ""}${qualityPts}`, inline: true },
            { name: "Sentiment", value: `${sentiment ?? "N/A"} → ${sentimentPts > 0 ? "+" : ""}${sentimentPts}`, inline: true },
        )
        .setTimestamp();
}
