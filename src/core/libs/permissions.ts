import { GuildMember } from "discord.js";
import { PERMISSION_HIERARCHY, ROLE_MAP } from "@core/config";

export function hasPermission(
    member: GuildMember,
    required: PermissionLevel
): boolean {

    if (required === "Member") return true;

    const requiredLevel = PERMISSION_HIERARCHY[required] ?? 0;

    for (const [level, config] of Object.entries(ROLE_MAP)) {

        const levelValue = PERMISSION_HIERARCHY[level] ?? 0;
        if (levelValue < requiredLevel) continue;

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

        const hasPerm =
            config.perms.length > 0 &&
            config.perms.some(p => member.permissions.has(p));

        if (hasPerm) return true;
    }

    return false;
}