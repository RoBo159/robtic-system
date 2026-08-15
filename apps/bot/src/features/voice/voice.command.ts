import { MessageFlags } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { voiceFeature } from "./voice";
import { stats } from "./commands/stats";
import { top } from "./commands/top";
import { view } from "./commands/config/view";
import { toggle, track, exclude, rates } from "./commands/config/edit";

/** Keyed `group:subcommand`, with a bare name when there is no group. */
const handlers: Record<string, FeatureSubcommandHandler> = {
    stats,
    top,
    "config:view": view,
    "config:toggle": toggle,
    "config:track": track,
    "config:exclude": exclude,
    "config:rates": rates,
};

export default buildFeatureCommands(voiceFeature, {
    voice: async (interaction: CommandInteractionLike, client: BotClient) => {
        if (!interaction.guildId) return;

        const group = interaction.options.getSubcommandGroup(false);
        // Config replies are noise for everyone else; stats and boards are worth showing.
        await interaction.deferReply(group === "config" ? { flags: MessageFlags.Ephemeral } : {});

        const sub = interaction.options.getSubcommand();
        const handler = handlers[group ? `${group}:${sub}` : sub];

        if (handler) await handler(interaction, client);
    },
}) satisfies CommandConfig[];
