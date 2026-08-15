import {
    Events,
    type Interaction,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { classifyError } from "@core/handlers";
import { touchActivity } from "@core/activity";
import { MessageFlags } from "discord.js";
import { errorEmbed } from "@utils";
import { checkPermissions, checkFeatureEnabled, commandError, cooldowns, releaseCooldown, HandlingComponent } from "../utils/interaction";

export default {
    name: Events.InteractionCreate,
    async execute(interaction: Interaction, client: BotClient) {
        const handledComponent = await HandlingComponent(interaction, client);
        if (handledComponent) return;

        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (command?.autocomplete) {
                try {
                    await command.autocomplete(interaction, client);
                } catch (error) {
                    const classified = classifyError(error);
                    Logger.warn(`[${classified.label}] Autocomplete error for "${interaction.commandName}": ${classified.detail}`, client.botName);
                }
            }
            return;
        }

        if (!interaction.isCommand()) return;

        // Running a command is deliberate participation, so it counts toward presence.
        if (interaction.guildId) touchActivity(interaction.guildId, interaction.user.id, "command");

        const command = client.commands.get(interaction.commandName);
        
        if (!command) {
            Logger.warn(`Command "${interaction.commandName}" not found`, client.botName);
            return;
        }

        try {
            const gate = await checkFeatureEnabled(command, interaction.guildId);
            if (!gate.allowed) {
                await interaction.reply({ embeds: [errorEmbed(gate.message!)], flags: MessageFlags.Ephemeral });
                return;
            }

            const hasPerms = await checkPermissions(interaction, command);
            if (!hasPerms) return;

            const canProceed = await cooldowns(interaction, command);
            if (!canProceed) return;

            try {
                await command.run(interaction, client);
            } catch (error) {
                // The command didn't actually complete (e.g. threw before/while replying,
                // interaction expired) — don't charge the cooldown for a no-op attempt.
                releaseCooldown(interaction);
                throw error;
            }
        } catch (error) {
            await commandError(error, interaction, client);
        }
    },
};
