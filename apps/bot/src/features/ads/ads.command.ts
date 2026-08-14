import { MessageFlags } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { adsFeature } from "./ads";
import { channel } from "./commands/channel";
import { panel } from "./commands/panel";
import { config } from "./commands/config";
import { manager } from "./commands/manager";

/** All four branches reply ephemerally, so the defer lives here and the leaves only editReply. */
const handlers: Record<string, FeatureSubcommandHandler> = { channel, panel, config, manager };

export default buildFeatureCommands(adsFeature, {
    "setup-ads": async (interaction: CommandInteractionLike, client: BotClient) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const handler = handlers[interaction.options.getSubcommand()];
        if (handler) await handler(interaction, client);
    },
}) satisfies CommandConfig[];
