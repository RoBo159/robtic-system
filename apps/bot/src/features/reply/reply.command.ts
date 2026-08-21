import { MessageFlags, type AutocompleteInteraction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { ReplyRepository } from "@database/repositories";
import { replyFeature } from "./reply";
import { add } from "./commands/add";
import { remove, deleteTrigger } from "./commands/remove";
import { list } from "./commands/list";
import { show } from "./commands/show";

const handlers: Record<string, FeatureSubcommandHandler> = {
    add,
    remove,
    delete: deleteTrigger,
    list,
    show,
};

export default buildFeatureCommands(replyFeature, {
    reply: {
        run: async (interaction: CommandInteractionLike, client: BotClient) => {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const handler = handlers[interaction.options.getSubcommand()];
            if (handler) await handler(interaction, client);
            else await interaction.editReply({ content: "That subcommand is not wired up yet." });
        },

        autocomplete: async (interaction: AutocompleteInteraction) => {
            const focused = interaction.options.getFocused(true);
            const query = focused.value.toLowerCase();

            if (focused.name === "id") {
                const rows = await ReplyRepository.listAll(interaction.guildId!);
                const matches = rows
                    .filter(row =>
                        row.id.includes(query)
                        || row.trigger.toLowerCase().includes(query)
                        || row.text.toLowerCase().includes(query))
                    .slice(0, 25);

                await interaction.respond(matches.map(row => ({
                    name: `${row.id} · ${row.trigger} → ${row.text}`.slice(0, 100),
                    value: row.id,
                })));
                return;
            }

            if (focused.name === "msg") {
                const triggers = await ReplyRepository.getAllTriggers(interaction.guildId!);
                const matches = triggers.filter(t => t.toLowerCase().includes(query)).slice(0, 25);

                await interaction.respond(matches.map(t => ({ name: t, value: t })));
            }
        },
    },
}) satisfies CommandConfig[];
