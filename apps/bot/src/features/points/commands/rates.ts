import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { getPointRates } from "@core/points";

export const rates: FeatureSubcommandHandler = async (interaction, _client) => {
    const r = await getPointRates(interaction.guildId!);

    const lines = [
        `• **1** point per **${r.messagesPerPoint}** messages`,
        `• **1** point per **${r.comboPerPoint}** combo score`,
        `• **1** point per **${r.voiceMinutesPerPoint}** minutes of active voice`,
        r.streakRewards.length
            ? `• Streak rewards: ${r.streakRewards.map(x => `**${x.streak}**d → **${x.points}**`).join(", ")}`
            : "• No streak rewards configured",
    ];

    const conversion = r.conversionEnabled
        ? `**${r.pointsPerRc}** points → **1** RC (minimum **${r.minConversionPoints}** points per conversion)`
        : "Converting to RC is switched off here.";

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("🎯 How points are earned")
            .setColor(COLORS.info)
            .setDescription(lines.join("\n"))
            .addFields({ name: "RC conversion", value: conversion })],
    });
};
