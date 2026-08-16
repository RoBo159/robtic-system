import type { GuildMember } from "discord.js";
import { isGuildOperator } from "@bot/utils/access";

/**
 * Whether this member may give someone their streak back.
 *
 * Administrators and the guild operator always can; beyond that it is the roles the guild assigned.
 * Checked in the handler rather than declared as `access: "admin"` on the command, because the
 * whole point is to let a non-administrator role through, and Discord's own gating gets the command
 * or nothing.
 */
export function canReturnStreaks(member: GuildMember, returnRoleIds: readonly string[]): boolean {
    if (isGuildOperator(member)) return true;
    return returnRoleIds.some(id => member.roles.cache.has(id));
}
