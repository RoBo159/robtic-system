import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { ServerConfigRepository } from "@database/repositories";

/**
 * Whether the member administers the bot in this guild: Discord's own Administrator permission, or
 * a role added with `/command-access admin-roles add`.
 *
 * The async counterpart to isGuildOperator, and the only check that reads ServerConfig. It is
 * reached only from checkPermissions, and only for a command declaring `access: "admin"`, so
 * player-facing commands never pay for the lookup.
 */
export async function hasGuildBotAdmin(member: GuildMember): Promise<boolean> {
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    const roleIds = await ServerConfigRepository.getBotAdminRolesCached(member.guild.id);
    return roleIds.some(id => member.roles.cache.has(id));
}
