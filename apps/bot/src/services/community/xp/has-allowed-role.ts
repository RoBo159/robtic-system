import type { GuildMember } from "discord.js";
import { XPSettingsRepository } from "@database/repositories/XPSettingsRepository";

export async function hasAllowedRole(guildId: string, member: GuildMember): Promise<boolean> {
    const settings = await XPSettingsRepository.get(guildId);
    if (!settings || settings.allowedRoles.length === 0) return true;
    return member.roles.cache.some(r => settings.allowedRoles.includes(r.id));
}
