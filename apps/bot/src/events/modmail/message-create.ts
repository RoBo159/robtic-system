import { Events, type Message } from "discord.js";
import { ModMailRepository } from "@database/repositories";
import { handleModMailDM } from "../../utils/modmail/handle-mod-mail-dm";
import { handleModMailStaff } from "../../utils/modmail/handle-mod-mail-staff";
import { handleReplyCommand } from "../../handlers/modmail/reply-handler";
import { handleTagCommand } from "../../handlers/modmail/tag-handler";
import { handleNoteCommand } from "../../handlers/modmail/note-handler";
import type { BotClient } from "@core/bot-client";

export default {
    name: Events.MessageCreate,
    async execute(message: Message, client: BotClient) {
        if (message.author.bot) return;

        const guild = client.guilds.cache.get(process.env.MainGuild!);
        if (!guild?.members.cache.get(message.author.id)) return;

        if (!message.guild) {
            handleModMailDM(message, client);
            return;
        }

        if (!message.channel.isThread()) return;

        const modmail = await ModMailRepository.findByThreadId(message.channel.id);
        if (!modmail || modmail.status !== "open") return;

        if (message.content.startsWith("!reply ")) {
            await handleReplyCommand(message, modmail, client);
            return;
        }

        if (message.content === "!tag" || message.content.startsWith("!tag ")) {
            await handleTagCommand(message, modmail, client);
            return;
        }

        if (message.content === "!note") {
            await handleNoteCommand(message, modmail);
            return;
        }

        handleModMailStaff(message, client);
    },
};
