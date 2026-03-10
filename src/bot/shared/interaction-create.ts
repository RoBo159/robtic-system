import {
    Events,
    type Interaction,
} from "discord.js";
import type { BotClient } from "@core/BotClient.ts";
import { Logger } from "@core/libs";
import { checkPermissions, commandError, cooldowns, HandlingComponent } from "./utils/interaction-helper";

export default {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction, client: BotClient) {
        await HandlingComponent(interaction, client);

        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command?.autocomplete) {
                try {
                    await command.autocomplete(interaction, client);
                } catch (error) {
                    Logger.warn(`Autocomplete error for "${interaction.commandName}": ${error}`, client.botName);
                }
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);
        
        if (!command) {
            Logger.warn(`Command "${interaction.commandName}" not found`, client.botName);
            return;
        }

        const hasPerms = await checkPermissions(interaction, command);
        if (!hasPerms) return;

        const canProceed = await cooldowns(interaction, command);
        if (!canProceed) return;

        try {
            await command.run(interaction, client);
        } catch (error) {
            await commandError(error, interaction, client);
        }
    },
};
