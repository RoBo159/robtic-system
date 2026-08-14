import { StaffTierRepository } from "@database/repositories";
import type { IRejoinRolesConfig } from "@database/models";

/**
 * Which roles count as staff for the short window.
 *
 * An explicit list wins. With none set, the guild's StaffTier bindings stand in — that is what the
 * hardcoded version did, so a guild that enables the feature without configuring anything keeps
 * behaving the way it used to rather than suddenly treating moderator roles as ordinary ones.
 */
export async function resolveStaffRoleIds(guildId: string, config: IRejoinRolesConfig): Promise<Set<string>> {
    if (config.staffRoleIds.length > 0) return new Set(config.staffRoleIds);

    const tiers = await StaffTierRepository.getCached(guildId);
    return new Set(tiers.flatMap(tier => tier.roleIds));
}
