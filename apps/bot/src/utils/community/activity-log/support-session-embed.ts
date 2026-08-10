import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function supportSessionEmbed(
    action: "created" | "claimed" | "resolved" | "auto-closed" | "reassigned",
    userId: string,
    staffId?: string,
    details?: string,
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(action === "resolved" ? COLORS.success : action === "auto-closed" || action === "reassigned" ? COLORS.warning : COLORS.info)
        .setTitle(COMMUNITY_MESSAGES.sessionTitles[action])
        .addFields({ name: "User", value: `<@${userId}>`, inline: true })
        .setTimestamp();

    if (staffId) {
        embed.addFields({ name: "Staff", value: `<@${staffId}>`, inline: true });
    }
    if (details) {
        embed.addFields({ name: "Details", value: details });
    }

    return embed;
}
