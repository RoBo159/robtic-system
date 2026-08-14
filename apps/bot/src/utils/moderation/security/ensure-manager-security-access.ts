import type { GuildMember } from "discord.js";
import { isGuildOperator } from "@bot/utils/access";

/** Full power (owner roles and whitelisted super users) clears this ahead of the raw Discord permissions. */
export async function ensureManagerSecurityAccess(member: GuildMember): Promise<boolean> {
    if (isGuildOperator(member)) return true;
    return member.permissions.has("ManageGuild") || member.permissions.has("Administrator");
}
