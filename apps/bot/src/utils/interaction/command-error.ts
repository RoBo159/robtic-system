import { MessageFlags, type ChatInputCommandInteraction, type Interaction, type InteractionReplyOptions } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { BotError, handleError, classifyError } from "@core/handlers";
import { errorEmbed } from "@utils";
import { scheduleDeletion } from "./schedule-deletion";

export const commandError = async (error: unknown, intract: Interaction, client: BotClient) => {
    let interaction = intract as ChatInputCommandInteraction;
    const classified = classifyError(error);

    handleError(
        new BotError(`[${classified.label}] Error running "${interaction.commandName}": ${classified.detail}`, "COMMAND"),
        `${client.botName}/InteractionCreate`
    );

    // Already dead — a reply attempt would just fail the same way and add a misleading second log.
    if (classified.category === "interaction_expired") return;

    const reply: InteractionReplyOptions = {
        embeds: [errorEmbed(classified.userMessage)],
        flags: MessageFlags.Ephemeral,
    };

    try {
        if (interaction.replied || interaction.deferred) {
            const msg = await interaction.followUp(reply);
            if (msg) scheduleDeletion(() => msg.delete());
        } else {
            await interaction.reply(reply);
            scheduleDeletion(() => interaction.deleteReply());
        }
    } catch {
        // Interaction already acknowledged or expired — suppress to avoid client error noise
    }
};
