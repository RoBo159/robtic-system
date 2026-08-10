import type { Guild } from "discord.js";
import { getModerationSecurityConfig } from "./get-moderation-security-config";

export async function isWhitelisted(guild: Guild, userId: string): Promise<boolean> {
    const config = await getModerationSecurityConfig(guild.id);
    if (config.whitelistUserIds.includes(userId)) return true;

    const member = guild.members.cache.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
    if (!member) return false;

    return member.roles.cache.some((role) => config.whitelistRoleIds.includes(role.id));
}
