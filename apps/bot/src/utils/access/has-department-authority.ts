import { GuildMember } from "discord.js";
import { hasFullPower } from "./has-full-power";
import { isOwner } from "./is-owner";
import { isLeadOf } from "./is-lead-of";
import { isManagerOf } from "./is-manager-of";

export async function hasDepartmentAuthority(member: GuildMember, department: Department): Promise<boolean> {
    if (hasFullPower(member)) return true;
    return (await isOwner(member)) || (await isLeadOf(member, department)) || (await isManagerOf(member, department));
}
