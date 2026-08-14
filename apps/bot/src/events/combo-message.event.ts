import { Events, type Message } from "discord.js";
import { processComboMessage } from "../services/combo";
import { handleError, BotError } from "@core/handlers";

export default {
    name: Events.MessageCreate,

    async execute(message: Message) {
        if (message.author.bot) return;
        if (!message.guild) return;

        await processComboMessage(message).catch(err => {
            handleError(new BotError(`Failed to process combo message: ${err}`, "EVENT"), "main/combo-message");
        });
    },
};
