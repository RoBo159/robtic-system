import { EmbedBuilder, type GuildMember } from "discord.js";
import { COLORS, AUDIT_MESSAGES } from "@constants";

export function memberJoinEmbed(member: GuildMember) {
    return new EmbedBuilder()
        .setTitle(AUDIT_MESSAGES.memberJoinTitle)
        .setColor(COLORS.success)
        .addFields(
            { name: AUDIT_MESSAGES.userFieldName, value: `<@${member.id}> (${member.id})` },
            { name: AUDIT_MESSAGES.accountCreatedFieldName, value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` },
        )
        .setTimestamp();
}
