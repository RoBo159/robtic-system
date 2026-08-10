import type { StringSelectMenuInteraction } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import type { ComboLeaderboardPeriod, TopCategory } from "@constants";
import { verifyInvoker } from "../utils/combo-components";
import { renderTopPanel } from "../utils/top-controls";

export const topPeriodHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^top:period:\d+:(streak|combo|xp|messages)$/,

    async run(interaction: StringSelectMenuInteraction) {
        const parts = interaction.customId.split(":");
        const invokerId = parts[2];
        const category = parts[3] as TopCategory;
        if (!(await verifyInvoker(interaction, invokerId))) return;

        const period = interaction.values[0] as ComboLeaderboardPeriod;
        await renderTopPanel(interaction, invokerId, category, period);
    },
};
