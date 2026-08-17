import type { StringSelectMenuInteraction } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import { TOP_ALL_CATEGORIES, type ComboLeaderboardPeriod } from "@constants";
import { verifyInvoker } from "@bot/utils/interaction";
import { renderTopPanel, type TopScope } from "../utils";

export const topPeriodHandler: ComponentHandler<StringSelectMenuInteraction> = {
    // `all` for the overview, otherwise the category the panel was opened on, then the page it is
    // currently showing — changing period keeps you where you were rather than resetting to page 1.
    customId: /^top:period:\d+:[a-z-]+:\d+$/,

    async run(interaction: StringSelectMenuInteraction) {
        const [, , invokerId, scope, page] = interaction.customId.split(":");
        if (!(await verifyInvoker(interaction, invokerId!))) return;

        await renderTopPanel(
            interaction,
            invokerId!,
            (scope ?? TOP_ALL_CATEGORIES) as TopScope,
            interaction.values[0] as ComboLeaderboardPeriod,
            Number(page ?? 0),
        );
    },
};
