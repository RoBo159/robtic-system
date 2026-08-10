import type { StringSelectMenuInteraction } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import type { ComboLeaderboardPeriod, TopCategory } from "@constants";
import { verifyInvoker } from "../utils/combo-components";
import { renderTopPanel } from "../utils/top-controls";

export const topCategoryHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^top:category:\d+:(daily|weekly|monthly|alltime)$/,

    async run(interaction: StringSelectMenuInteraction) {
        const parts = interaction.customId.split(":");
        const invokerId = parts[2];
        const period = parts[3] as ComboLeaderboardPeriod;
        if (!(await verifyInvoker(interaction, invokerId))) return;

        const category = interaction.values[0] as TopCategory;
        await renderTopPanel(interaction, invokerId, category, period);
    },
};
