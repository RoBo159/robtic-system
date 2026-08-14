import type { AutocompleteInteraction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import type { CommandInteractionLike } from "@typings/feature";
import { buildFeatureCommands } from "@core/features";
import { panelsFeature } from "./panels";
import { panelList, panelSend, panelDelete, panelAutocompleteChoices, sentPanelAutocomplete } from "./functions/actions";

const handlers = { list: panelList, send: panelSend, delete: panelDelete } as const;

export default buildFeatureCommands(panelsFeature, {
    panels: {
        run: async (interaction: CommandInteractionLike) => {
            const handler = handlers[interaction.options.getSubcommand() as keyof typeof handlers];
            if (handler) await handler(interaction);
        },
        autocomplete: async (interaction: AutocompleteInteraction) => {
            const sub = interaction.options.getSubcommand();
            const focused = interaction.options.getFocused();

            if (sub === "send") {
                await interaction.respond(await panelAutocompleteChoices(focused));
            } else if (sub === "delete") {
                await interaction.respond(await sentPanelAutocomplete(interaction.guildId!, focused));
            }
        },
    },
}) satisfies CommandConfig[];
