import type { Guild } from "discord.js";
import { Logger } from "@logger";
import { STAFF_WARN_ROLE } from "@constants";

const CTX = "hr:staff-warn-role";

/** Found-by-name first, same convention as ensureStreakRole — never recreated if one already exists under that name. */
export async function ensureWarnRole(guild: Guild, level: number) {
    const name = STAFF_WARN_ROLE.name(level);
    const existing = guild.roles.cache.find((role) => role.name === name);
    if (existing) return existing;

    return guild.roles.create({ name, reason: STAFF_WARN_ROLE.creationReason }).catch((err) => {
        Logger.warn(`Could not create warn role "${name}" in ${guild.id}: ${err}`, CTX);
        return null;
    });
}
