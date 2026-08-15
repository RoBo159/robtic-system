import { MessageFlags, type AutocompleteInteraction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { ReplyRepository } from "@database/repositories";
import { replyFeature } from "./reply";
import { add } from "./commands/add";
import { remove } from "./commands/remove";
import { list } from "./commands/list";
import { show } from "./commands/show";

const handlers: Record<string, FeatureSubcommandHandler> = { add, delete: remove, list, show };

export default buildFeatureCommands(replyFeature, {
    reply: {
        run: async (interaction: CommandInteractionLike, client: BotClient) => {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const handler = handlers[interaction.options.getSubcommand()];
            if (handler) await handler(interaction, client);
        },
        autocomplete: async (interaction: AutocompleteInteraction) => {
            const focused = interaction.options.getFocused(true);
            if (focused.name !== "msg") return;

            const triggers = await ReplyRepository.getAllTriggers(interaction.guildId!);
            const matches = triggers
                .filter(t => t.toLowerCase().includes(focused.value.toLowerCase()))
                .slice(0, 25);

            await interaction.respond(matches.map(t => ({ name: t, value: t })));
        },
    },
}) satisfies CommandConfig[];
