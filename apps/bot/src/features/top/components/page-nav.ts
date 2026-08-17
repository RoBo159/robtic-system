import type { ButtonInteraction } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import { TOP_ALL_CATEGORIES, type ComboLeaderboardPeriod } from "@constants";
import { verifyInvoker } from "@bot/utils/interaction";
import { renderTopPanel, type TopScope } from "../utils";

/**
 * Page buttons on a `/top` panel.
 *
 * The id carries everything the redraw needs — who opened it, which board, which page and which
 * period — because a component interaction arrives with no memory of the message it came from, and
 * reading state back out of the embed would be guesswork.
 */
export const topPageHandler: ComponentHandler<ButtonInteraction> = {
    customId: /^top:nav:\d+:[a-z-]+:\d+:(daily|weekly|monthly|alltime)$/,

    async run(interaction: ButtonInteraction) {
        const [, , invokerId, scope, page, period] = interaction.customId.split(":");
        if (!(await verifyInvoker(interaction, invokerId!))) return;

        await renderTopPanel(
            interaction,
            invokerId!,
            (scope ?? TOP_ALL_CATEGORIES) as TopScope,
            period as ComboLeaderboardPeriod,
            Number(page ?? 0),
        );
    },
};
