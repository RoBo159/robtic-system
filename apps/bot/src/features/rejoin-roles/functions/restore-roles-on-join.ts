import type { GuildMember } from "discord.js";
import { SavedRolesRepository, RejoinRolesConfigRepository } from "@database/repositories";
import { Logger } from "@logger";
import { isFeatureEnabled } from "@core/features";

const CTX = "rejoin-roles";
const HOUR_MS = 60 * 60 * 1000;

/**
 * Gives a returning member their roles back, subject to two windows.
 *
 * Ordinary roles come back within `retentionHours`; staff roles only within the shorter
 * `staffRetentionHours`, so someone who left a month ago returns as a member rather than a
 * moderator. Both are measured from when they left.
 *
 * The snapshot is consumed either way — expired or not — so a member who rejoins after the window
 * does not keep a stale copy waiting for a second attempt.
 */
export async function restoreRolesOnJoin(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    if (!(await isFeatureEnabled(member.guild.id, "rejoin-roles"))) return;

    const saved = await SavedRolesRepository.find(member.guild.id, member.id);
    if (!saved) return;

    await SavedRolesRepository.remove(member.guild.id, member.id);

    const config = await RejoinRolesConfigRepository.getCached(member.guild.id);
    const elapsed = Date.now() - saved.leftAt.getTime();
    const excluded = new Set(config.excludedRoleIds);

    const restore: string[] = [];

    const isLegacy = saved.staffRoles.length === 0 && saved.otherRoles.length === 0 && saved.roles.length > 0;
    const ordinary = isLegacy ? saved.roles : saved.otherRoles;

    if (elapsed <= config.retentionHours * HOUR_MS) restore.push(...ordinary);
    if (!isLegacy && elapsed <= config.staffRetentionHours * HOUR_MS) restore.push(...saved.staffRoles);

    const grantable = restore.filter(id => !excluded.has(id) && member.guild.roles.cache.has(id));
    if (grantable.length === 0) return;

    for (const roleId of grantable) {
        await member.roles.add(roleId).catch(err => {
            Logger.warn(`Could not restore role ${roleId} for ${member.id} in ${member.guild.id}: ${err}`, CTX);
        });
    }

    Logger.debug(`Restored ${grantable.length} role(s) to ${member.id} in ${member.guild.id}`, CTX);
}
