import { EmbedBuilder, type Message } from "discord.js";
import { COLORS, AUDIT_MESSAGES, DELETED_MESSAGE_PREVIEW_LENGTH } from "@constants";

function contentPreview(text: string) {
    if (!text || text.trim().length === 0) return AUDIT_MESSAGES.emptyOrUncached;
    if (text.length <= DELETED_MESSAGE_PREVIEW_LENGTH) return text;
    return `${text.slice(0, DELETED_MESSAGE_PREVIEW_LENGTH)}...`;
}

export function messageDeleteEmbed(message: Message) {
    return new EmbedBuilder()
        .setTitle(AUDIT_MESSAGES.messageDeleteTitle)
        .setColor(COLORS.warning)
        .addFields(
            { name: AUDIT_MESSAGES.authorFieldName, value: message.author ? `<@${message.author.id}> (${message.author.id})` : AUDIT_MESSAGES.unknownValue },
            { name: AUDIT_MESSAGES.channelFieldName, value: `<#${message.channel.id}>`, inline: true },
            { name: AUDIT_MESSAGES.messageIdFieldName, value: message.id, inline: true },
            { name: AUDIT_MESSAGES.contentFieldName, value: contentPreview(message.content) },
        )
        .setTimestamp();
}
