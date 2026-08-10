/**
 * Command categories and where each one may be used.
 *
 * The commands channel exists to keep `!profile` and `!top` spam out of conversation channels.
 * That reasoning does not extend to staff work: an admin fixing a misconfigured role, or a
 * moderator checking server status during an incident, should not have to walk to a specific
 * channel first — and forcing them to spreads the very noise the restriction was meant to prevent,
 * because staff commands then run where everyone is talking.
 *
 * So the restriction is applied per category rather than to every prefix command.
 */

/** Every category a command may declare. `category` on CommandConfig should be one of these. */
export const COMMAND_CATEGORIES = [
    "General",
    "Profile",
    "Economy",
    "Leaderboard",
    "Leveling",
    "Streak",
    "Activity",
    "Projects",
    "Utility",
    "Partnership",
    "Minecraft",
    "Configuration",
    "Admin",
    "Moderation",
    "Tickets",
    "Staff",
    "Threads",
    "Tags",
] as const;

export type CommandCategory = typeof COMMAND_CATEGORIES[number];

/**
 * Categories exempt from the commands-channel restriction.
 *
 * These are staff and operational commands. They are already gated by permission, so channel
 * confinement adds nothing except friction at the moment it is least wanted.
 */
export const UNRESTRICTED_COMMAND_CATEGORIES: readonly string[] = [
    "Minecraft",
    "Configuration",
    "Admin",
    "Moderation",
    "Utility",
    "Tickets",
    "Staff",
    "Threads",
    "Tags",
];

/**
 * Whether a command must be run in the configured commands channel.
 *
 * An uncategorised command counts as General and is restricted — the safe default, since a new
 * command that forgot its category is far more likely to be a player-facing one.
 */
export function isChannelRestricted(category: string | undefined): boolean {
    if (!category) return true;
    return !UNRESTRICTED_COMMAND_CATEGORIES.includes(category);
}
