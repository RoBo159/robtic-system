import type { GuildMember } from "discord.js";
import { STREAK_ROLE } from "@constants";
import { ensureStreakRole } from "./ensure-streak-role";

/** Swaps the member's previous streak-level role for the one matching their current streak (or clears it if the streak is gone). */
export async function applyStreakRole(member: GuildMember, level: number): Promise<void> {
    const existingStreakRoles = member.roles.cache.filter(r => STREAK_ROLE.namePattern.test(r.name));

    if (level <= 0) {
        for (const role of existingStreakRoles.values()) {
            await member.roles.remove(role).catch(() => null);
        }
        return;
    }

    const target = await ensureStreakRole(member.guild, level);

    for (const role of existingStreakRoles.values()) {
        if (role.id !== target.id) {
            await member.roles.remove(role).catch(() => null);
        }
    }

    if (!member.roles.cache.has(target.id)) {
        await member.roles.add(target).catch(() => null);
    }
}
