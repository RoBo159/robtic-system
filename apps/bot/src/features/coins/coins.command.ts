import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { coinsFeature } from "./coins";
import { balance } from "./commands/balance";
import { add } from "./commands/add";
import { remove } from "./commands/remove";

/**
 * An explicit map rather than a glob over commands/: it keeps typecheck honest about every
 * subcommand having a handler, and avoids a second filesystem pass at boot.
 */
const handlers: Record<string, FeatureSubcommandHandler> = { balance, add, remove };

export default buildFeatureCommands(coinsFeature, {
    coins: async (interaction: CommandInteractionLike, client: BotClient) => {
        const handler = handlers[interaction.options.getSubcommand()];
        if (handler) await handler(interaction, client);
    },
}) satisfies CommandConfig[];
