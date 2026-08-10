import { GuildMember } from "discord.js";
import { StaffTierRepository } from "@database/repositories";
import { hasFullPower } from "./has-full-power";
import { matchesTier } from "./matches-tier";

export async function isInDepartment(member: GuildMember, department: Department): Promise<boolean> {
    if (hasFullPower(member)) return true;
    const tiers = await StaffTierRepository.getCached(member.guild.id);
    return tiers.some(tier =>
        tier.department?.toLowerCase() === department.toLowerCase() && matchesTier(member, tier.roleIds)
    );
}
