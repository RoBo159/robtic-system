import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, POINT_HISTORY_PAGE_SIZE, POINT_MESSAGES } from "@constants";
import { PointHistoryRepository } from "@database/repositories";

const SOURCE_LABEL: Record<string, string> = {
    message: "💬 messages",
    combo: "🔁 combo",
    streak: "🔥 streak",
    voice: "🎙️ voice",
    quest: "🗺️ quest",
    community: "🎉 community",
    admin: "🛠️ admin",
    conversion: "✨ converted to RC",
    "coin-migration": "🪙 coin migration",
};

export const history: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const [rows, totals] = await Promise.all([
        PointHistoryRepository.recent(guildId, interaction.user.id, POINT_HISTORY_PAGE_SIZE),
        PointHistoryRepository.totals(guildId, interaction.user.id),
    ]);

    if (!rows.length) {
        await interaction.editReply({ content: POINT_MESSAGES.noHistory });
        return;
    }

    const lines = rows.map(row => {
        const sign = row.amount > 0 ? "+" : "";
        const when = `<t:${Math.floor(row.createdAt.getTime() / 1000)}:R>`;
        return `\`${sign}${row.amount}\` ${SOURCE_LABEL[row.source] ?? row.source}${row.detail ? ` — ${row.detail}` : ""} · ${when}`;
    });

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("🎯 Your recent points")
            .setColor(COLORS.info)
            .setDescription(lines.join("\n"))
            .setFooter({ text: `Earned ${totals.earned} · spent ${totals.spent} · converted ${totals.converted}` })],
    });
};
