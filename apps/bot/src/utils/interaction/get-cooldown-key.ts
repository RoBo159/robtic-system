import type { ChatInputCommandInteraction } from "discord.js";

/**
 * Cooldown identity for an invocation: the command, plus its subcommand path so that e.g.
 * `/streak claim` and `/streak top` cool down independently.
 *
 * This used to be prefixed with the bot's name, back when six clients shared one cooldown store
 * and moderation's `/mod` had to be kept apart from modmail's. One client owns every command now,
 * and command names are unique across it, so the prefix only made the keys longer.
 */
export function getCooldownKey(interaction: ChatInputCommandInteraction): string {
    const parts = [interaction.commandName];
    try {
        const group = interaction.options.getSubcommandGroup(false);
        if (group) parts.push(group);
        const sub = interaction.options.getSubcommand(false);
        if (sub) parts.push(sub);
    } catch {
        // Command has no subcommands defined — fall back to the base command name.
    }
    return parts.join(":");
}
