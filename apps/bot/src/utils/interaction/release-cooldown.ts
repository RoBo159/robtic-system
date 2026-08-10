import type { ChatInputCommandInteraction, Interaction } from "discord.js";
import { clearCooldown } from "@utils";
import { getCooldownKey } from "./get-cooldown-key";

/** Rolls back the cooldown charged for this interaction, for use when the command failed to actually run to completion. */
export const releaseCooldown = (intract: Interaction): void => {
    const interaction = intract as ChatInputCommandInteraction;
    clearCooldown(interaction.user.id, getCooldownKey(interaction), interaction.guildId ?? "dm");
};
