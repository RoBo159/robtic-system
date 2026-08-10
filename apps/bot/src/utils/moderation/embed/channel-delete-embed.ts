import { EmbedBuilder, type GuildChannel } from "discord.js";
import { COLORS, AUDIT_MESSAGES } from "@constants";

export function channelDeleteEmbed(channel: GuildChannel, executorId: string | null) {
    return new EmbedBuilder()
        .setTitle(AUDIT_MESSAGES.channelDeleteTitle)
        .setColor(COLORS.error)
        .addFields(
            { name: AUDIT_MESSAGES.channelFieldName, value: `${channel.name} (${channel.id})` },
            { name: AUDIT_MESSAGES.typeFieldName, value: channel.type.toString(), inline: true },
            { name: AUDIT_MESSAGES.executorFieldName, value: executorId ? `<@${executorId}> (${executorId})` : AUDIT_MESSAGES.unknownValue, inline: true },
        )
        .setTimestamp();
}
