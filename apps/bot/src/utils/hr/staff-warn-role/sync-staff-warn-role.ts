import type { GuildMember } from "discord.js";
import { Logger } from "@logger";
import { STAFF_WARN_ROLE } from "@constants";
import { ensureWarnRole } from "./ensure-warn-role";

const CTX = "hr:staff-warn-role";

/** Swaps a staff member's `Warn N` role to match their current warning count — removes any other Warn role first. */
export async function syncStaffWarnRole(member: GuildMember, warningCount: number): Promise<void> {
    const existingWarnRoles = member.roles.cache.filter((role) => STAFF_WARN_ROLE.namePattern.test(role.name));
    for (const [, role] of existingWarnRoles) {
        await member.roles.remove(role).catch((err) => {
            Logger.warn(`Could not remove warn role "${role.name}" from ${member.id} in ${member.guild.id}: ${err}`, CTX);
        });
    }

    if (warningCount <= 0) return;

    const role = await ensureWarnRole(member.guild, warningCount);
    if (!role) return;

    await member.roles.add(role).catch((err) => {
        Logger.warn(`Could not add warn role "${role.name}" to ${member.id} in ${member.guild.id}: ${err}`, CTX);
    });
}
