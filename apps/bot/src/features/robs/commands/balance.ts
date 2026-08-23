import { MessageFlags } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { ROBS_MESSAGES } from "@constants";
import { getRobsBalance } from "../lib";

/**
 * `/balance` — the caller's robs.
 *
 * Ephemeral, matching `/coins balance`: a balance is the player's own business, and a public reply
 * in a busy channel is noise for everyone else.
 *
 * The link requirement is not a policy choice — a Discord id cannot be turned into a Minecraft
 * balance without one, because robs are keyed by Minecraft UUID. See `getRobsBalance`.
 */
export const balance: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guildId) {
        await interaction.editReply({ content: ROBS_MESSAGES.guildOnly });
        return;
    }

    const result = await getRobsBalance(interaction.guildId, interaction.user.id);

    if (!result.linked) {
        await interaction.editReply({ content: ROBS_MESSAGES.notLinked });
        return;
    }

    const username = result.minecraftUsername ?? interaction.user.username;

    await interaction.editReply({
        content: result.robs === 0
            ? ROBS_MESSAGES.empty(username)
            : ROBS_MESSAGES.balance(username, result.robs),
    });
};
