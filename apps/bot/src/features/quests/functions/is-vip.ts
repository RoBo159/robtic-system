import type { GuildMember } from "discord.js";
import { QuestSettingsRepository } from "@database/repositories";
import { benefitsForRoles, PremiumFeature } from "@core/premium";

/**
 * Whether a member may claim VIP quests.
 *
 * Asks the Premium Engine, not the roles. The quest feature no longer knows what a premium role is
 * — it knows there is a benefit called `VIP_QUEST_ACCESS`, and a server decides which tier grants
 * it. Adding a "Lifetime" tier, or granting VIP access through something other than a role, needs
 * no change here.
 *
 * `vipRoleIds` on QuestSettings is still honoured as a fallback for servers configured before the
 * engine existed: their VIP quests keep working, and moving to a premium tier is a choice rather
 * than a forced migration.
 */
export async function isVipMember(member: GuildMember): Promise<boolean> {
    const roleIds = [...member.roles.cache.keys()];

    const benefits = await benefitsForRoles(member.guild.id, member.id, roleIds);
    if (benefits.values[PremiumFeature.VIP_QUEST_ACCESS] === true) return true;

    const settings = await QuestSettingsRepository.getCached(member.guild.id);
    return settings.vipRoleIds.some(roleId => member.roles.cache.has(roleId));
}
