import { EmbedBuilder, type GuildMember } from "discord.js";
import { COLORS, AUDIT_MESSAGES } from "@constants";

export function memberKickEmbed(member: GuildMember, executorId: string, reason: string) {
    return new EmbedBuilder()
        .setTitle(AUDIT_MESSAGES.memberKickTitle)
        .setColor(COLORS.warning)
        .addFields(
            { name: AUDIT_MESSAGES.targetFieldName, value: `<@${member.id}> (${member.id})` },
            { name: AUDIT_MESSAGES.executorFieldName, value: `<@${executorId}> (${executorId})` },
            { name: AUDIT_MESSAGES.reasonFieldName, value: reason },
        )
        .setTimestamp();
}
