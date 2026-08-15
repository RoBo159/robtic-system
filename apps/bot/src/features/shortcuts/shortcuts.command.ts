import { MessageFlags, type AutocompleteInteraction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike, FeatureSubcommandHandler } from "@typings/feature";
import type { BotClient } from "@core/bot-client";
import { buildFeatureCommands } from "@core/features";
import { allCommandPaths } from "@bot/utils/prefix";
import { ShortcutRepository } from "@database/repositories";
import { shortcutsFeature } from "./shortcuts";
import { add } from "./commands/add";
import { remove } from "./commands/remove";
import { list } from "./commands/list";
import { info } from "./commands/info";
import { toggle } from "./commands/toggle";
import { roleAdd, roleRemove, channelAdd, channelRemove, clearRestrictions } from "./commands/restrict/edit-restriction";
import { CHAT_UTIL_COMMANDS } from "./functions/run-chat-util";

/** Keyed `group:subcommand`, with a bare name when there is no group. */
const handlers: Record<string, FeatureSubcommandHandler> = {
    add,
    remove,
    list,
    info,
    toggle,
    "restrict:role-add": roleAdd,
    "restrict:role-remove": roleRemove,
    "restrict:channel-add": channelAdd,
    "restrict:channel-remove": channelRemove,
    "restrict:clear": clearRestrictions,
};

export default buildFeatureCommands(shortcutsFeature, {
    shortcut: {
        run: async (interaction: CommandInteractionLike, client: BotClient) => {
            if (!interaction.guildId) return;
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const group = interaction.options.getSubcommandGroup(false);
            const sub = interaction.options.getSubcommand();
            const handler = handlers[group ? `${group}:${sub}` : sub];

            if (handler) await handler(interaction, client);
        },

        autocomplete: async (interaction: AutocompleteInteraction, client: BotClient) => {
            const focused = interaction.options.getFocused(true);
            const query = focused.value.toLowerCase();

            if (focused.name === "command") {
                // `includes`, not `startsWith`, so typing "add" still finds "warn add".
                const targets = [...new Set([...CHAT_UTIL_COMMANDS, ...allCommandPaths(client)])]
                    .filter(c => c.toLowerCase().includes(query))
                    .sort()
                    .slice(0, 25);

                await interaction.respond(targets.map(c => ({
                    name: CHAT_UTIL_COMMANDS.has(c) ? `${c} (channel utility)` : `/${c}`,
                    value: c,
                })));
                return;
            }

            if (focused.name === "trigger" && interaction.guildId) {
                const shortcuts = await ShortcutRepository.listCached(interaction.guildId);
                const matches = shortcuts.filter(s => s.trigger.includes(query)).slice(0, 25);
                await interaction.respond(matches.map(s => ({ name: `${s.trigger} → /${s.command}`, value: s.trigger })));
            }
        },
    },
}) satisfies CommandConfig[];
