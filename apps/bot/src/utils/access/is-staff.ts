import { GuildMember } from "discord.js";
import { STAFF_TIER_THRESHOLDS } from "@constants";
import { isGuildOperator } from "./is-guild-operator";
import { getMemberLevel } from "./get-member-level";

export async function isStaff(member: GuildMember): Promise<boolean> {
    if (isGuildOperator(member)) return true;
    const { score } = await getMemberLevel(member);
    return score >= STAFF_TIER_THRESHOLDS.staff;
}
