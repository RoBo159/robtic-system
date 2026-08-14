import type { Message } from "discord.js";
import { handleError, BotError } from "@core/handlers";
import { isFeatureEnabled } from "@core/features";
import { processStreakMessage } from "./process-streak-message";

export async function onStreakMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!(await isFeatureEnabled(message.guild.id, "streak"))) return;

    await processStreakMessage(message).catch(err => {
        handleError(new BotError(`Failed to process streak message: ${err}`, "EVENT"), "main/streak-message");
    });
}
