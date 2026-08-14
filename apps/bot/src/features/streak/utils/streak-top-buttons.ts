import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { t, type Lang } from "@bot/utils/lang";
import type { LeaderboardMode } from "../functions/get-leaderboard";

/** The current/best toggle under the `/streak-top` leaderboard. */
export function buildStreakTopButtons(activeMode: LeaderboardMode, lang: Lang): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("streak-top-current")
            .setLabel(t("streakTop.button_current", lang))
            .setEmoji("🔥")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(activeMode === "current"),
        new ButtonBuilder()
            .setCustomId("streak-top-best")
            .setLabel(t("streakTop.button_best", lang))
            .setEmoji("🏆")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(activeMode === "best"),
    );
}
