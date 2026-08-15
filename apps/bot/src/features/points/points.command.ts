import { MessageFlags } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { pointsFeature } from "./points";
import { balance } from "./commands/balance";
import { rates } from "./commands/rates";
import { history } from "./commands/history";
import { convert } from "./commands/convert";
import { add, remove } from "./commands/adjust";
import { migrateCoins } from "./commands/migrate-coins";

const handlers: Record<string, FeatureSubcommandHandler> = {
    balance,
    rates,
    history,
    convert,
    add,
    remove,
    "migrate-coins": migrateCoins,
};

export default buildFeatureCommands(pointsFeature, {
    points: async (interaction: CommandInteractionLike, client: BotClient) => {
        if (!interaction.guildId) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const handler = handlers[interaction.options.getSubcommand()];
        if (handler) await handler(interaction, client);
    },
}) satisfies CommandConfig[];
