import { MessageFlags, type ChatInputCommandInteraction, type Interaction, type InteractionReplyOptions } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { BotError, handleError, classifyError } from "@core/handlers";
import { errorText } from "@utils";
import { scheduleDeletion } from "./schedule-deletion";

export const commandError = async (error: unknown, intract: Interaction, client: BotClient) => {
    let interaction = intract as ChatInputCommandInteraction;
    const classified = classifyError(error);

    handleError(
        new BotError(`[${classified.label}] Error running "${interaction.commandName}": ${classified.detail}`, "COMMAND"),
        `${client.botName}/InteractionCreate`
    );

    if (classified.category === "interaction_expired") return;

    const reply: InteractionReplyOptions = {
        content: errorText(classified.userMessage),
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
    }
};
