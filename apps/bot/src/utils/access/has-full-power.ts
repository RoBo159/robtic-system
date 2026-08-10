import { GuildMember } from "discord.js";
import { FULL_POWER_ROLE_IDS } from "@constants";
import { SuperUserRepository } from "@database/repositories";

/**
 * The single choke point every other access helper short-circuits on, so whitelisted super users
 * (/whitelist) clear in-command checks like isAnyManager/isStaff too — not just the command gate
 * in checkPermissions.
 */
export function hasFullPower(member: GuildMember): boolean {
    if (FULL_POWER_ROLE_IDS.some(id => member.roles.cache.has(id))) return true;
    return SuperUserRepository.isWhitelistedCached(member.id);
}
