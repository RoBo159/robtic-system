import { EmbedBuilder } from "discord.js";
import { Colors } from "@core/config";

export const errorEmbed = (description: string) => {
    return new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription(`\`\`\`${description}\`\`\``)
        .setColor(Colors.error)
        .setTimestamp()
        .setFooter({
            text: "Please contact support if you think this shouldn't happen.",
        })
};