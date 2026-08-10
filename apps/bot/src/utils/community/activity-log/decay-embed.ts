import { EmbedBuilder } from "discord.js";
import { COLORS, COMMUNITY_MESSAGES } from "@constants";

export function decayEmbed(userId: string, username: string, xpLost: number, levelDown: boolean, oldLevel: number, newLevel: number): EmbedBuilder {
    return new EmbedBuilder()
        .setColor(levelDown ? COLORS.error : COLORS.warning)
        .setTitle(levelDown ? COMMUNITY_MESSAGES.levelDownDecayTitle : COMMUNITY_MESSAGES.xpDecayTitle)
        .addFields(
            { name: "User", value: `<@${userId}>`, inline: true },
            { name: "XP Lost", value: `-${xpLost}`, inline: true },
            { name: "Level", value: levelDown ? `${oldLevel} → ${newLevel}` : `${newLevel}`, inline: true },
        )
        .setTimestamp();
}
