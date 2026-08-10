import { EmbedBuilder, type GuildBan } from "discord.js";
import { COLORS, AUDIT_MESSAGES } from "@constants";

export function memberBanEmbed(ban: GuildBan, executorId: string | undefined, reason: string) {
    return new EmbedBuilder()
        .setTitle(AUDIT_MESSAGES.memberBanTitle)
        .setColor(COLORS.error)
        .addFields(
            { name: AUDIT_MESSAGES.targetFieldName, value: `<@${ban.user.id}> (${ban.user.id})` },
            { name: AUDIT_MESSAGES.executorFieldName, value: executorId ? `<@${executorId}> (${executorId})` : AUDIT_MESSAGES.unknownValue },
            { name: AUDIT_MESSAGES.reasonFieldName, value: reason },
        )
        .setTimestamp();
}
