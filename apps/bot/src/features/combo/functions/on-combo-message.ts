import type { Message } from "discord.js";
import { handleError, BotError } from "@core/handlers";
import { isFeatureEnabled } from "@core/features";
import { processComboMessage } from "./combo";

export async function onComboMessage(message: Message): Promise<void> {
    if (message.author.bot) return;
    if (!message.guild) return;
    if (!(await isFeatureEnabled(message.guild.id, "combo"))) return;

    await processComboMessage(message).catch(err => {
        handleError(new BotError(`Failed to process combo message: ${err}`, "EVENT"), "main/combo-message");
    });
}
