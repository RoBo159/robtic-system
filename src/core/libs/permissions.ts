import { GuildMember } from "discord.js";
import { PERMISSION_HIERARCHY, ROLE_MAP, FULL_POWER_ROLE_ID } from "@core/config";

export function hasPermission(
    member: GuildMember,
    requiredScore: number
): boolean {
    if (requiredScore <= 0) return true;
    if (member.roles.cache.has(FULL_POWER_ROLE_ID)) return true;

    for (const [level, config] of Object.entries(ROLE_MAP)) {
        const levelValue = PERMISSION_HIERARCHY[level] ?? 0;
        if (levelValue < requiredScore) continue;

        const hasRoleId =
            config.ids.length > 0 &&
            member.roles.cache.some(role => config.ids.includes(role.id));

        if (hasRoleId) return true;

        const hasRoleName =
            config.names.length > 0 &&
            member.roles.cache.some(role =>
                config.names.some(name => role.name.toLowerCase() === name.toLowerCase())
            );

        if (hasRoleName) return true;
    }

    return false;
}