import { GuildMember } from "discord.js";
import { StaffTierRepository } from "@database/repositories";
import { matchesTier } from "./matches-tier";

export async function getMemberDepartments(member: GuildMember): Promise<string[]> {
    const tiers = await StaffTierRepository.getCached(member.guild.id);
    const departments = new Set<string>();
    for (const tier of tiers) {
        if (tier.department && matchesTier(member, tier.roleIds)) departments.add(tier.department);
    }
    return [...departments];
}
