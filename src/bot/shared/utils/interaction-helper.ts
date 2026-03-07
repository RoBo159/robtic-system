import type { CommandConfig } from "@core/config";
import { hasPermission } from "@core/libs";
import { isOnCooldown, getRemainingCooldown, errorEmbed } from "@core/utils";
import { ChatInputCommandInteraction, MessageFlags, type GuildMember, type Interaction } from "discord.js";
import type { BotClient } from "@core/BotClient";
import { BotError, handleError } from "@core/handlers";

export const HandlingComponent = async (interaction: Interaction, client: BotClient) => {
    if (
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isModalSubmit()
    ) {
        const customId = interaction.customId;

        for (const [, handler] of client.components) {
            const pattern =
                handler.customId instanceof RegExp
                    ? handler.customId
                    : new RegExp(`^${handler.customId}$`);

            if (pattern.test(customId)) {
                try {
                    await handler.run(interaction as any, client);
                } catch (error) {
                    handleError(
                        new BotError(`Error handling component "${customId}": ${error}`, "EVENT"),
                        `${client.botName}/InteractionCreate`
                    );
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            embeds: [errorEmbed("Something went wrong.")],
                            flags: MessageFlags.Ephemeral,
                        });
                    }
                }
                return;
            }
        }
        return;
    }
}

export const checkPermissions = async (intract: Interaction, command: CommandConfig) => {
    let interaction = intract as ChatInputCommandInteraction;

    const member = interaction.member as GuildMember;
    if (command.requiredPermission && !hasPermission(member, command.requiredPermission)) {
        await interaction.reply({
            embeds: [errorEmbed("You don't have permission to use this command.")],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
}

export const cooldowns = async (intract: Interaction, command: CommandConfig) => {
    let interaction = intract as ChatInputCommandInteraction;

    const cooldownMs = (command.cooldown ?? 5) * 1000;
    if (isOnCooldown(interaction.user.id, interaction.commandName, cooldownMs)) {
        const remaining = getRemainingCooldown(interaction.user.id, interaction.commandName, cooldownMs);
        await interaction.reply({
            embeds: [errorEmbed(`Please wait ${remaining}s before using this command again.`)],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
}

export const commandError = async (error : unknown, intract : Interaction, client: BotClient) => {
    let interaction = intract as ChatInputCommandInteraction;

    handleError(
        new BotError(`Error running "${interaction.commandName}": ${error}`, "COMMAND"),
        `${client.botName}/InteractionCreate`
    );

    const reply = {
        embeds: [errorEmbed("Something went wrong while executing this command.")],
        ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
    } else {
        await interaction.reply(reply);
    }
}