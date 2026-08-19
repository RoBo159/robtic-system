import type { GuildMember } from "discord.js";
import { STAFF_TIER_THRESHOLDS } from "@constants";
import { hasCommandAccessGrant } from "@bot/utils/command-access";
import { isGuildOperator } from "./is-guild-operator";
import { hasGuildBotAdmin } from "./has-guild-bot-admin";
import { getMemberLevel } from "./get-member-level";

/**
 * checkPermissions' grant order, for a moderation surface that has no CommandConfig to hang it on.
 *
 * The channel utilities behind `lock`/`clear` shortcuts are the case that needs this: they run
 * straight from a message, so there is no slash command whose permission gate they inherit. Reusing
 * the same ladder here is what keeps "who may lock a channel" one answer rather than two — guild
 * operator, a /command-access grant, a staff tier at or above `minScore`, or a bot-admin role.
 *
 * Deliberately does *not* accept a raw Discord permission such as ManageChannels as a way in. That
 * is a channel-management permission, not a statement about who moderates for this bot, and it is
 * routinely held by roles nobody meant to hand moderation tooling to.
 */
export async function hasModerationAccess(
    member: GuildMember,
    /** The command name a /command-access grant would be stored under. */
    commandName: string,
    minScore: number,
): Promise<boolean> {
    if (isGuildOperator(member)) return true;
    if (await hasCommandAccessGrant(member.guild.id, commandName, member)) return true;

    const { score } = await getMemberLevel(member);
    if (score >= STAFF_TIER_THRESHOLDS.lead) return true;
    if (score >= minScore) return true;

    return hasGuildBotAdmin(member);
}
