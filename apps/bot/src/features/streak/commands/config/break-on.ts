import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { StreakSettingsRepository } from "@database/repositories";

/** Chooses which punishments end a streak. Omitted options are left alone. */
export const breakOn: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const settings = await StreakSettingsRepository.get(guildId);

    const timeoutInput = interaction.options.getBoolean("timeout");
    const kickInput = interaction.options.getBoolean("kick");

    const breakOnTimeout = timeoutInput === null ? (settings?.breakOnTimeout ?? true) : timeoutInput;
    const breakOnKick = kickInput === null ? (settings?.breakOnKick ?? false) : kickInput;

    await StreakSettingsRepository.setBreakTriggers(guildId, breakOnTimeout, breakOnKick);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("Streak break triggers updated")
            .setColor(COLORS.success)
            .setDescription(
                `**Timeout:** ${breakOnTimeout ? "ends the streak" : "no effect"}\n` +
                `**Kick:** ${breakOnKick ? "ends the streak" : "no effect"}`
            )
            .setFooter({ text: "/mute, /jail and warn auto-mutes all apply a timeout, so they follow the timeout setting." })],
    });
};
