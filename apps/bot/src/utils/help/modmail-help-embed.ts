import { EmbedBuilder } from "discord.js";
import { COLORS, MODMAIL_HELP } from "@constants";

export function modmailHelpEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle(MODMAIL_HELP.title)
        .setColor(COLORS.info)
        .addFields(...MODMAIL_HELP.fields)
        .setTimestamp();
}
