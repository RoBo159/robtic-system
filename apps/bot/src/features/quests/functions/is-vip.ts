import type { GuildMember } from "discord.js";
import { QuestSettingsRepository } from "@database/repositories";

/**
 * Whether a member may claim VIP quests.
 *
 * Configured Discord roles, and nothing else. The `Membership` and `ServiceTier` models exist in
 * the schema but have never had a single call site, so there is no live premium concept to reuse —
 * resurrecting them here would invent one on the quest engine's behalf. Any one of the configured
 * roles is enough, so a server can list Prime, Prime+, Premium, VIP and Lifetime side by side.
 */
export async function isVipMember(member: GuildMember): Promise<boolean> {
    const settings = await QuestSettingsRepository.getCached(member.guild.id);
    if (settings.vipRoleIds.length === 0) return false;

    return settings.vipRoleIds.some(roleId => member.roles.cache.has(roleId));
}
