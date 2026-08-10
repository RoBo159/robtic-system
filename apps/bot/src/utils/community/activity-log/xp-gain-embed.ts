import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function xpGainEmbed(username: string, userId: string, xp: number, leveledUp: boolean, newLevel: number): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(leveledUp ? COLORS.success : COLORS.activity)
        .setTitle(leveledUp ? COMMUNITY_MESSAGES.levelUpTitle : COMMUNITY_MESSAGES.xpGainedTitle)
        .addFields(
            { name: "User", value: `<@${userId}>`, inline: true },
            { name: "XP", value: `+${xp}`, inline: true },
            { name: "Level", value: `${newLevel}`, inline: true },
        )
        .setTimestamp();

    if (leveledUp) {
        embed.setDescription(COMMUNITY_MESSAGES.levelUpDescription(username, newLevel));
    }

    return embed;
}
