import { GuildMember } from "discord.js";
import { StaffTierRepository } from "@database/repositories";
import { matchesTier } from "./matches-tier";

/**
 * The member's highest matching staff tier. Tiers are per-guild rows (see StaffTier) rather than a
 * hardcoded ladder, so this reads a cached list per guild — hence the `async`.
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
