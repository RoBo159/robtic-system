import { EmbedBuilder, type GuildMember } from "discord.js";
import { COLORS, AUDIT_MESSAGES } from "@constants";

export function memberLeaveEmbed(member: GuildMember) {
    return new EmbedBuilder()
        .setTitle(AUDIT_MESSAGES.memberLeaveTitle)
        .setColor(COLORS.warning)
        .addFields(
            { name: AUDIT_MESSAGES.userFieldName, value: `<@${member.id}> (${member.id})` },
        )
        .setTimestamp();
}
