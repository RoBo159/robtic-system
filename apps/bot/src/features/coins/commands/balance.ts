import { MessageFlags } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COIN_MESSAGES } from "@constants";
import { getCoinSummary } from "../lib";
import { resolveTarget } from "../utils/resolve-target";

export const balance: FeatureSubcommandHandler = async (interaction, _client) => {
    // No guild check: the balance is global and so is the display-name lookup behind resolveTarget,
    // so there is nothing here that needs to know which server asked.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = await resolveTarget(interaction);
    const summary = await getCoinSummary(target.user.id);

    await interaction.editReply({
        content: target.isSelf
            ? COIN_MESSAGES.ownBalance(summary.coins)
            : COIN_MESSAGES.otherBalance(target.displayName, summary.coins),
    });
};
