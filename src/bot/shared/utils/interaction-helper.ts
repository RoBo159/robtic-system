import type { CommandConfig } from "@core/config";
import { FULL_POWER_ROLE_ID } from "@core/config";
import { isOnCooldown, getRemainingCooldown, errorEmbed } from "@core/utils";
import { ChatInputCommandInteraction, MessageFlags, type GuildMember, type Interaction, type InteractionReplyOptions } from "discord.js";
import type { BotClient } from "@core/BotClient";
import { BotError, handleError } from "@core/handlers";
import { getMemberLevel, isInDepartment } from "@shared/utils/access";

export const HandlingComponent = async (interaction: Interaction, client: BotClient): Promise<boolean> => {
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
                    try {
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({
                                embeds: [errorEmbed("Something went wrong.")],
                                flags: MessageFlags.Ephemeral,
                            });
                        }
                    } catch {
                        // Interaction already acknowledged or expired — suppress to avoid client error noise
                    }
                }
                return true;
            }
        }
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    embeds: [errorEmbed("This action is no longer available. Please try again.")],
                    flags: MessageFlags.Ephemeral,
                });
            } catch {
                // Ignore interaction lifecycle race conditions.
            }
        }
        return true;
    }

    return false;
}

export const checkPermissions = async (intract: Interaction, command: CommandConfig): Promise<boolean> => {
    let interaction = intract as ChatInputCommandInteraction;

    const member = interaction.member as GuildMember;

    if (member.roles.cache.has(FULL_POWER_ROLE_ID)) return true;

    const { score } = getMemberLevel(member);

    if (score >= 90) return true;

    if (command.requiredPermission && score < command.requiredPermission) {
        await interaction.reply({
            embeds: [errorEmbed("You don't have permission to use this command.")],
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }

    if (command.department && !isInDepartment(member, command.department)) {
        await interaction.reply({
            embeds: [errorEmbed(`This command is restricted to the ${command.department} department.`)],
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }

    return true;
}

export const cooldowns = async (intract: Interaction, command: CommandConfig): Promise<boolean> => {
    let interaction = intract as ChatInputCommandInteraction;

    const cooldownMs = (command.cooldown ?? 5) * 1000;
    if (isOnCooldown(interaction.user.id, interaction.commandName, cooldownMs)) {
        const remaining = getRemainingCooldown(interaction.user.id, interaction.commandName, cooldownMs);
        await interaction.reply({
            embeds: [errorEmbed(`Please wait ${remaining}s before using this command again.`)],
            flags: MessageFlags.Ephemeral,
        });
        return false;
    }
    return true;
}

export const commandError = async (error: unknown, intract: Interaction, client: BotClient) => {
    let interaction = intract as ChatInputCommandInteraction;

    handleError(
        new BotError(`Error running "${interaction.commandName}": ${error}`, "COMMAND"),
        `${client.botName}/InteractionCreate`
    );

    const reply: InteractionReplyOptions = {
        embeds: [errorEmbed("Something went wrong while executing this command.")],
        flags: MessageFlags.Ephemeral,
    };

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
        } else {
            await interaction.reply(reply);
        }
    } catch {
        // Interaction already acknowledged or expired — suppress to avoid client error noise
    }
}