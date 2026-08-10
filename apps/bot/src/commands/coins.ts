import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { COIN_MESSAGES } from "@constants";
import { getCoinSummary } from "@core/coins";
import { UserRepository } from "@database/repositories";

export default {
    category: "Economy",
    data: new SlashCommandBuilder()
        .setName("coins")
        .setDescription("See how many coins you (or another member) have earned")
        .addUserOption(opt =>
            opt.setName("user").setDescription("The member to check (defaults to yourself)").setRequired(false)
        ),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        if (!interaction.guildId) {
            await interaction.reply({ content: COIN_MESSAGES.guildOnly, flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const target = interaction.options.getUser("user") ?? interaction.user;
        const summary = await getCoinSummary(interaction.guildId, target.id);
        const displayName = await UserRepository.getDisplayName(target.id) ?? target.username;

        const self = target.id === interaction.user.id;
        await interaction.editReply({
            content: self
                ? COIN_MESSAGES.ownBalance(summary.coins)
                : COIN_MESSAGES.otherBalance(displayName, summary.coins),
        });
    },
};
