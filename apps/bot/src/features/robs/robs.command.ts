import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { robsFeature } from "./robs";
import { balance } from "./commands/balance";

/**
 * `/balance` takes no subcommand, so the runner is the handler itself rather than a dispatch map.
 */
export default buildFeatureCommands(robsFeature, {
    balance: async (interaction: CommandInteractionLike, client: BotClient) => {
        await balance(interaction, client);
    },
}) satisfies CommandConfig[];
