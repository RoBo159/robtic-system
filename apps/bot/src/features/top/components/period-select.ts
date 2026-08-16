import type { StringSelectMenuInteraction } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import { TOP_ALL_CATEGORIES, type ComboLeaderboardPeriod } from "@constants";
import { verifyInvoker } from "@bot/utils/interaction";
import { renderTopPanel, type TopScope } from "../utils";

export const topPeriodHandler: ComponentHandler<StringSelectMenuInteraction> = {
    // `all` for the overview, otherwise the category the panel was opened on. Every category in
    // TOP_CATEGORIES belongs here — voice and points were missing, so changing the period on those
    // two panels matched no handler and did nothing.
    customId: /^top:period:\d+:(all|streak|combo|xp|messages|voice|points|coins|quests)$/,

    async run(interaction: StringSelectMenuInteraction) {
        const parts = interaction.customId.split(":");
        const invokerId = parts[2]!;
        const scope = (parts[3] ?? TOP_ALL_CATEGORIES) as TopScope;
        if (!(await verifyInvoker(interaction, invokerId))) return;

        const period = interaction.values[0] as ComboLeaderboardPeriod;
        await renderTopPanel(interaction, invokerId, scope, period);
    },
};
