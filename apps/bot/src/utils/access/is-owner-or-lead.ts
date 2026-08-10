import { GuildMember } from "discord.js";
import { STAFF_TIER_THRESHOLDS } from "@constants";
import { hasFullPower } from "./has-full-power";
import { getMemberLevel } from "./get-member-level";

export async function isOwnerOrLead(member: GuildMember): Promise<boolean> {
    if (hasFullPower(member)) return true;
    const { score } = await getMemberLevel(member);
    return score >= STAFF_TIER_THRESHOLDS.lead;
}
