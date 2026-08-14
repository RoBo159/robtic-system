import { EmbedBuilder } from "discord.js";
import type { IStreak } from "@database/models";
import { COLORS } from "@constants";
import { t, type Lang } from "@bot/utils/lang";
import type { LeaderboardMode } from "./get-leaderboard";

export function buildLeaderboardEmbed(guildName: string, mode: LeaderboardMode, records: IStreak[], lang: Lang): EmbedBuilder {
    const lines = records.length
        ? records.map((r, i) => `**${i + 1}.** <@${r.discordId}> — ${mode === "current" ? r.currentStreak : r.bestStreak} 🔥`).join("\n")
        : t("streakTop.no_entries", lang);

    return new EmbedBuilder()
        .setTitle(t(mode === "current" ? "streakTop.title_current" : "streakTop.title_best", lang, { guild: guildName }))
        .setDescription(lines)
        .setColor(COLORS.activity)
        .setFooter({ text: guildName })
        .setTimestamp();
}
