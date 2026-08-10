import { MessageFlags, type ChatInputCommandInteraction, type Interaction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import { DEFAULT_COMMAND_COOLDOWN_SECONDS, INTERACTION_MESSAGES } from "@constants";
import { startCooldown, errorEmbed } from "@utils";
import { getCooldownKey } from "./get-cooldown-key";
import { scheduleDeletion } from "./schedule-deletion";

/** Charges this invocation's cooldown. False means the user is still cooling down and has been told so. */
export const cooldowns = async (intract: Interaction, command: CommandConfig): Promise<boolean> => {
    const interaction = intract as ChatInputCommandInteraction;

    const cooldownMs = (command.cooldown ?? DEFAULT_COMMAND_COOLDOWN_SECONDS) * 1000;
    const scopeId = interaction.guildId ?? "dm";

    const remaining = startCooldown(interaction.user.id, getCooldownKey(interaction), cooldownMs, scopeId);
    if (remaining === 0) return true;

    await interaction.reply({
        embeds: [errorEmbed(INTERACTION_MESSAGES.cooldownWait(remaining))],
        flags: MessageFlags.Ephemeral,
    });
    scheduleDeletion(() => interaction.deleteReply());
    return false;
};
