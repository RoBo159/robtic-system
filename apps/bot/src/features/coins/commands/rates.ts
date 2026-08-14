import { MessageFlags } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COIN_MESSAGES } from "@constants";
import { getCoinRates } from "../lib";

export const rates: FeatureSubcommandHandler = async (interaction, _client) => {
    if (!interaction.guildId) {
        await interaction.reply({ content: COIN_MESSAGES.guildOnly, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const { messagesPerCoin, comboPerCoin, streakRewards } = await getCoinRates(interaction.guildId);

    await interaction.editReply({ content: COIN_MESSAGES.rates(messagesPerCoin, comboPerCoin, streakRewards) });
};
