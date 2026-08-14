import type { GuildMember } from "discord.js";
import { isGuildOperator } from "@bot/utils/access";

/**
 * Whether `executor` outranks `target` in the role hierarchy.
 *
 * Discord only enforces this for the *bot*; nothing stops a moderator asking the bot to ban someone
 * senior to them, and the bot would happily comply because its own role is higher than both. The
 * guild owner and full-power roles are exempt, since they are the hierarchy.
 */
export function canActOn(executor: GuildMember, target: GuildMember): boolean {
    if (executor.id === target.id) return false;
    if (target.id === executor.guild.ownerId) return false;
    if (executor.id === executor.guild.ownerId) return true;
    if (isGuildOperator(executor)) return true;

    return executor.roles.highest.comparePositionTo(target.roles.highest) > 0;
}
