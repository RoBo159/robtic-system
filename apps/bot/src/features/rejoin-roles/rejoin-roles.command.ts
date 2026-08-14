import { MessageFlags } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { rejoinRolesFeature } from "./rejoin-roles";
import { status } from "./commands/status";
import { timers } from "./commands/timers";
import { excludeAdd, excludeRemove, staffAdd, staffRemove } from "./commands/edit-roles";

/** Keyed `group:subcommand`, with a bare name when there is no group. */
const handlers: Record<string, FeatureSubcommandHandler> = {
    status,
    timers,
    "exclude:add": excludeAdd,
    "exclude:remove": excludeRemove,
    "staff:add": staffAdd,
    "staff:remove": staffRemove,
};

export default buildFeatureCommands(rejoinRolesFeature, {
    "rejoin-roles": async (interaction: CommandInteractionLike, client: BotClient) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const group = interaction.options.getSubcommandGroup(false);
        const sub = interaction.options.getSubcommand();
        const handler = handlers[group ? `${group}:${sub}` : sub];

        if (handler) await handler(interaction, client);
    },
}) satisfies CommandConfig[];
