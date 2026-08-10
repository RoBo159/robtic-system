import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function aiDecisionEmbed(
    username: string,
    userId: string,
    classification: string,
    confidence: number,
    fallback: boolean,
    context: string,
): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(fallback ? COLORS.warning : COLORS.info)
        .setTitle(COMMUNITY_MESSAGES.aiDecisionTitle(fallback))
        .addFields(
            { name: "User", value: `<@${userId}>`, inline: true },
            { name: "Classification", value: classification, inline: true },
            { name: "Confidence", value: `${(confidence * 100).toFixed(0)}%`, inline: true },
            { name: "Context", value: context, inline: true },
            { name: "Mode", value: fallback ? "Rule-based" : "AI", inline: true },
        )
        .setTimestamp();
}
