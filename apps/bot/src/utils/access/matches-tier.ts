import { GuildMember } from "discord.js";

export function matchesTier(member: GuildMember, roleIds: string[]): boolean {
    return roleIds.length > 0 && member.roles.cache.some(r => roleIds.includes(r.id));
}
