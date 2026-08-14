import type { GuildMember, PartialGuildMember } from "discord.js";
import { SavedRolesRepository, RejoinRolesConfigRepository } from "@database/repositories";
import { Logger } from "@logger";
import { isFeatureEnabled } from "@core/features";
import { resolveStaffRoleIds } from "../utils/resolve-staff-role-ids";

const CTX = "rejoin-roles";

/**
 * Snapshots a departing member's roles.
 *
 * A ban is not a departure. By the time GuildMemberRemove fires for one, the ban entry already
 * exists — it is what caused the removal — which is how this tells a ban apart from a kick or
 * someone leaving, and why a banned member never gets roles back if they are later unbanned.
 *
 * Excluded roles are dropped here rather than at restore time, so a guild that excludes a role
 * never holds a copy of who had it.
 */
export async function saveRolesOnLeave(member: GuildMember | PartialGuildMember): Promise<void> {
    if (member.user.bot) return;
    if (!(await isFeatureEnabled(member.guild.id, "rejoin-roles"))) return;

    const banEntry = await member.guild.bans.fetch(member.id).catch(() => null);
    if (banEntry) return;

    const config = await RejoinRolesConfigRepository.getCached(member.guild.id);
    const excluded = new Set(config.excludedRoleIds);

    const roleIds = member.roles.cache
        .filter(role => role.id !== member.guild.id && !role.managed && !excluded.has(role.id))
        .map(role => role.id);

    if (roleIds.length === 0) return;

    const staffRoleSet = await resolveStaffRoleIds(member.guild.id, config);
    const staffRoles = roleIds.filter(id => staffRoleSet.has(id));
    const otherRoles = roleIds.filter(id => !staffRoleSet.has(id));

    await SavedRolesRepository.save(member.guild.id, member.id, {
        staffRoles,
        otherRoles,
        wasStaff: staffRoles.length > 0,
    }).catch(err => {
        Logger.warn(`Could not save roles for ${member.id} leaving ${member.guild.id}: ${err}`, CTX);
    });
}
