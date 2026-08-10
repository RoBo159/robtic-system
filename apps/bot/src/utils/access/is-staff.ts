import { GuildMember } from "discord.js";
import { STAFF_TEAM_ROLE_ID, STAFF_TIER_THRESHOLDS } from "@constants";
import { hasFullPower } from "./has-full-power";
import { getMemberLevel } from "./get-member-level";

export async function isStaff(member: GuildMember): Promise<boolean> {
    if (hasFullPower(member)) return true;
    if (member.roles.cache.has(STAFF_TEAM_ROLE_ID)) return true;
    const { score } = await getMemberLevel(member);
    return score >= STAFF_TIER_THRESHOLDS.staff;
}
