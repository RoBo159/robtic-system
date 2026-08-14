import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { devFeature } from "./dev";
import { share } from "./commands/share";

const handlers: Record<string, FeatureSubcommandHandler> = { share };

export default buildFeatureCommands(devFeature, {
    project: async (interaction: CommandInteractionLike, client: BotClient) => {
        const handler = handlers[interaction.options.getSubcommand()];
        if (handler) await handler(interaction, client);
    },
}) satisfies CommandConfig[];
