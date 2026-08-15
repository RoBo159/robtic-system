import type { StringSelectMenuInteraction } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import { TOP_ALL_CATEGORIES, type ComboLeaderboardPeriod } from "@constants";
import { verifyInvoker } from "@bot/utils/interaction";
import { renderTopPanel, type TopScope } from "../utils";

export const topPeriodHandler: ComponentHandler<StringSelectMenuInteraction> = {
    // `all` for the overview, otherwise the category the panel was opened on.
    customId: /^top:period:\d+:(all|streak|combo|xp|messages|coins)$/,

    async run(interaction: StringSelectMenuInteraction) {
        const parts = interaction.customId.split(":");
        const invokerId = parts[2]!;
        const scope = (parts[3] ?? TOP_ALL_CATEGORIES) as TopScope;
        if (!(await verifyInvoker(interaction, invokerId))) return;

        const period = interaction.values[0] as ComboLeaderboardPeriod;
        await renderTopPanel(interaction, invokerId, scope, period);
    },
};
