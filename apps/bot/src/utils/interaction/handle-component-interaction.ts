import { MessageFlags, type Interaction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { BotError, handleError, classifyError } from "@core/handlers";
import { isFeatureEnabled } from "@core/features";
import { getFeatureManifest } from "@core/features/feature-registry";
import { errorText } from "@utils";
import { INTERACTION_MESSAGES } from "@constants";

export const HandlingComponent = async (interaction: Interaction, client: BotClient): Promise<boolean> => {
    if (
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isRoleSelectMenu() ||
        interaction.isChannelSelectMenu() ||
        interaction.isUserSelectMenu() ||
        interaction.isMentionableSelectMenu() ||
        interaction.isModalSubmit()
    ) {
        const customId = interaction.customId;

        for (const [, handler] of client.components) {
            const pattern =
                handler.customId instanceof RegExp
                    ? handler.customId
                    : new RegExp(`^${handler.customId}$`);

            if (pattern.test(customId)) {
                if (handler.feature && interaction.guildId && !(await isFeatureEnabled(interaction.guildId, handler.feature))) {
                    const manifest = getFeatureManifest(handler.feature);
                    await interaction.reply({
                        content: errorText(INTERACTION_MESSAGES.featureDisabled(manifest?.description ?? handler.feature, handler.feature)),
                        flags: MessageFlags.Ephemeral,
                    }).catch(() => null);
                    return true;
                }

                try {
                    await handler.run(interaction as any, client);
                } catch (error) {
                    const classified = classifyError(error);
                    handleError(
                        new BotError(`[${classified.label}] Error handling component "${customId}": ${classified.detail}`, "EVENT"),
                        `${client.botName}/InteractionCreate`
                    );

                    if (classified.category === "interaction_expired") return true;

                    try {
                        if (!interaction.replied && !interaction.deferred) {
                            await interaction.reply({
                                content: errorText(classified.userMessage),
                                flags: MessageFlags.Ephemeral,
                            });
                        }
                    } catch {
                    }
                }
                return true;
            }
        }
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: errorText(INTERACTION_MESSAGES.staleComponent),
                    flags: MessageFlags.Ephemeral,
                });
            } catch {
            }
        }
        return true;
    }

    return false;
};
