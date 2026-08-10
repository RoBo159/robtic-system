import { EmbedBuilder, type GuildMember, type Role } from "discord.js";
import { COLORS, AUDIT_MESSAGES } from "@constants";

export function roleUpdateEmbed(
    newMember: GuildMember,
    added: Map<string, Role>,
    removed: Map<string, Role>,
    executorId: string | undefined,
    reason: string | undefined,
) {
    return new EmbedBuilder()
        .setTitle(AUDIT_MESSAGES.roleUpdateTitle)
        .setColor(COLORS.warning)
        .addFields(
            { name: AUDIT_MESSAGES.targetFieldName, value: `<@${newMember.id}> (${newMember.id})` },
            {
                name: AUDIT_MESSAGES.addedRolesFieldName,
                value: added.size > 0 ? Array.from(added.values()).map((role) => `<@&${role.id}>`).join(", ") : AUDIT_MESSAGES.noneValue,
            },
            {
                name: AUDIT_MESSAGES.removedRolesFieldName,
                value: removed.size > 0 ? Array.from(removed.values()).map((role) => `<@&${role.id}>`).join(", ") : AUDIT_MESSAGES.noneValue,
            },
            { name: AUDIT_MESSAGES.executorFieldName, value: executorId ? `<@${executorId}> (${executorId})` : AUDIT_MESSAGES.unknownValue },
            { name: AUDIT_MESSAGES.reasonFieldName, value: reason ?? AUDIT_MESSAGES.noReasonProvided },
        )
        .setTimestamp();
}
