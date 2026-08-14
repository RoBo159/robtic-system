import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { SuperUserRepository } from "@database/repositories";

/**
 * Whoever operates the bot in *this* server: its owner, anyone holding Discord's Administrator
 * permission, or a whitelisted super user (/whitelist). The single choke point every other access
 * helper short-circuits on, so a super user clears in-command checks like isManager/isStaff too —
 * not just the command gate in checkPermissions.
 *
 * Synchronous on purpose. Every caller is sync, several sit in hot moderation paths, and the
 * per-guild bot-admin role list is deliberately left out to keep it that way — that check lives in
 * hasGuildBotAdmin, which is only reached from checkPermissions where an await already exists.
 */
export function isGuildOperator(member: GuildMember): boolean {
    if (member.id === member.guild.ownerId) return true;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return SuperUserRepository.isWhitelistedCached(member.id);
}
