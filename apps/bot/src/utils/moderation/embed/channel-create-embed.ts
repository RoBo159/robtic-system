import { EmbedBuilder, type GuildChannel } from "discord.js";
import { COLORS, AUDIT_MESSAGES, CHANNEL_TYPE_LABELS } from "@constants";

export function channelCreateEmbed(channel: GuildChannel, executorId: string | null) {
    return new EmbedBuilder()
        .setTitle(AUDIT_MESSAGES.channelCreateTitle)
        .setColor(COLORS.success)
        .addFields(
            { name: AUDIT_MESSAGES.channelFieldName, value: `${channel.toString()}` },
            { name: AUDIT_MESSAGES.typeFieldName, value: CHANNEL_TYPE_LABELS[channel.type] ?? AUDIT_MESSAGES.unknownValue, inline: true },
            { name: AUDIT_MESSAGES.executorFieldName, value: executorId ? `<@${executorId}>` : AUDIT_MESSAGES.unknownValue, inline: true },
        )
        .setTimestamp();
}
