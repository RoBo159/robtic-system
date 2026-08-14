import { readFileSync } from "node:fs";
import { GuildFeature, type Guild, type Role } from "discord.js";
import { Logger } from "@logger";
import { STREAK_ROLE } from "@constants";
import { getIconPathForLevel } from "./icon-ranges";

const CTX = "main:streak-role";

/** Finds the guild's role for a streak level by name, creating it (with icon, if supported) only if missing. */
export async function ensureStreakRole(guild: Guild, level: number): Promise<Role> {
    const name = STREAK_ROLE.name(level);
    const existing = guild.roles.cache.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;

    const iconPath = getIconPathForLevel(level);
    let icon: Buffer | undefined;
    if (iconPath && guild.features.includes(GuildFeature.RoleIcons)) {
        try {
            icon = readFileSync(iconPath);
        } catch (err) {
            Logger.warn(`Failed to read streak icon at ${iconPath}: ${err}`, CTX);
        }
    }

    try {
        return await guild.roles.create({ name, icon, mentionable: false, reason: STREAK_ROLE.creationReason });
    } catch (err) {
        Logger.warn(`Failed to create streak role "${name}" with icon, retrying without icon: ${err}`, CTX);
        return guild.roles.create({ name, mentionable: false, reason: STREAK_ROLE.creationReason });
    }
}
