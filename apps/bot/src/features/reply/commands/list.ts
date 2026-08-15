import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { ReplyRepository } from "@database/repositories";

export const list: FeatureSubcommandHandler = async (interaction, _client) => {
    const triggers = await ReplyRepository.getAllTriggers(interaction.guildId!);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("Auto-replies")
            .setColor(COLORS.info)
            .setDescription(triggers.length ? triggers.map(t => `• ${t}`).join("\n") : "No triggers configured yet.")],
    });
};
