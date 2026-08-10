import { GuildMember } from "discord.js";
import { StaffTierRepository } from "@database/repositories";
import { matchesTier } from "./matches-tier";

/**
 * Per-guild staff tiers/departments (see StaffTier model) replaced the old global
 * ROLE_MAP/PERMISSION_HIERARCHY — the check reads a per-guild, cached tier list
 * instead of a hardcoded constant, hence the `async`.
 */
export async function getMemberLevel(member: GuildMember): Promise<{ level: string; score: number }> {
    const tiers = await StaffTierRepository.getCached(member.guild.id);

    let best = "Member";
    let bestScore = 0;
    for (const tier of tiers) {
        if (tier.score <= bestScore) continue;
        if (matchesTier(member, tier.roleIds)) {
            best = tier.key;
            bestScore = tier.score;
        }
    }
    return { level: best, score: bestScore };
}
