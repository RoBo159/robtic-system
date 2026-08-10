import { MessageFlags, type Interaction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { BotError, handleError, classifyError } from "@core/handlers";
import { errorEmbed } from "@utils";
import { INTERACTION_MESSAGES } from "@constants";

export const HandlingComponent = async (interaction: Interaction, client: BotClient): Promise<boolean> => {
    if (
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isRoleSelectMenu() ||
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
                    const classified = classifyError(error);
                    handleError(
                        new BotError(`[${classified.label}] Error handling component "${customId}": ${classified.detail}`, "EVENT"),
                        `${client.botName}/InteractionCreate`
                    );

                    // Interaction token already dead — replying would just fail the same way.
                    if (classified.category === "interaction_expired") return true;

                    try {
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({
                                embeds: [errorEmbed(classified.userMessage)],
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
                    embeds: [errorEmbed(INTERACTION_MESSAGES.staleComponent)],
                    flags: MessageFlags.Ephemeral,
                });
            } catch {
                // Ignore interaction lifecycle race conditions.
            }
        }
        return true;
    }

    return false;
};
