import { Events, type Message } from "discord.js";
import { processStreakMessage } from "../services/streak-service";
import { handleError, BotError } from "@core/handlers";

export default {
    name: Events.MessageCreate,

    async execute(message: Message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        await processStreakMessage(message).catch(err => {
            handleError(new BotError(`Failed to process streak message: ${err}`, "EVENT"), "main/streak-message");
        });
    },
};
