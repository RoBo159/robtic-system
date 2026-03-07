import {
    ButtonInteraction,
    MessageFlags,
    type ThreadChannel,
} from "discord.js";

import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { closeModMail } from "../utils/closeModMail";
import messages from "../utils/messages.json";

const modmailCloseBtn: ComponentHandler<ButtonInteraction> = {
    customId: /^modmail_close_\d+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const threadId = interaction.customId.replace("modmail_close_", "");

        const modmail = await ModMailRepository.findByThreadId(threadId);
        if (!modmail || modmail.status !== "open") {
            await interaction.reply({
                content: messages.errors.thread_already_closed,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply();

        const thread = interaction.channel as ThreadChannel;
        await closeModMail(modmail, interaction.user.id, client, thread);

        await interaction.editReply({ content: messages.success.thread_closed });
    },
};

export default modmailCloseBtn;
