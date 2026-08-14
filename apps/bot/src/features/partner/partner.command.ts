import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { partnerFeature } from "./partner";
import { add } from "./commands/add";
import { remove } from "./commands/remove";
import { announce } from "./commands/announce";

/**
 * Every subcommand opens a modal, which is why the manifest marks the command `modalOnly` — the
 * prefix stand-in has no showModal, so the router refuses `!partner` with a clear message rather
 * than throwing.
 */
const handlers: Record<string, FeatureSubcommandHandler> = { add, remove, announce };

export default buildFeatureCommands(partnerFeature, {
    partner: async (interaction: CommandInteractionLike, client: BotClient) => {
        const handler = handlers[interaction.options.getSubcommand()];
        if (handler) await handler(interaction, client);
    },
}) satisfies CommandConfig[];
