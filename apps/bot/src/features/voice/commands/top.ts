import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, TOP_DETAIL_LIMIT } from "@constants";
import { PeriodicStatRepository, VoiceRepository } from "@database/repositories";
import { formatVoiceDuration } from "../utils/format-duration";

type Board = "total" | "weekly" | "monthly" | "xp";

const TITLE: Record<Board, string> = {
    total: "🎙️ Most voice time — all time",
    weekly: "🎙️ Most voice time — this week",
    monthly: "🎙️ Most voice time — this month",
    xp: "🎙️ Most voice XP — all time",
};

/**
 * Reads whichever store owns the board.
 *
 * Period boards come from PeriodicStat, which already backs every other weekly/monthly ranking;
 * all-time comes from VoiceStat, where the lifetime totals are folded in on session close.
 */
async function readBoard(guildId: string, board: Board): Promise<{ discordId: string; value: number }[]> {
    if (board === "weekly" || board === "monthly") {
        const rows = await PeriodicStatRepository.getTop(guildId, board, "voiceTime", TOP_DETAIL_LIMIT);
        return rows.map(r => ({ discordId: r.discordId, value: r.value }));
    }

    if (board === "xp") {
        const rows = await VoiceRepository.getTopByXp(guildId, TOP_DETAIL_LIMIT);
        return rows.map(r => ({ discordId: r.discordId, value: r.totalXpEarned }));
    }

    const rows = await VoiceRepository.getTopByActiveTime(guildId, TOP_DETAIL_LIMIT);
    return rows.map(r => ({ discordId: r.discordId, value: r.totalActiveSeconds }));
}

export const top: FeatureSubcommandHandler = async (interaction, _client) => {
    const board = (interaction.options.getString("board") ?? "total") as Board;
    const entries = await readBoard(interaction.guildId!, board);

    const format = board === "xp"
        ? (v: number) => `${v} XP`
        : (v: number) => formatVoiceDuration(v);

    const lines = entries.map((e, i) => {
        const line = `**${i + 1}.** <@${e.discordId}> — ${format(e.value)}`;
        return e.discordId === interaction.user.id ? `__${line}__` : line;
    });

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle(TITLE[board])
            .setColor(COLORS.activity)
            .setDescription(lines.join("\n") || "No voice activity recorded yet.")
            .setTimestamp()],
    });
};
