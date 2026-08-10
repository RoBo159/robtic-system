import {
    ButtonInteraction,
    MessageFlags,
    type ThreadChannel,
} from "discord.js";

import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { closeModMail } from "../../utils/modmail/close-mod-mail";
import messages from "../../utils/modmail/messages.json";

const modmailCloseBtn: ComponentHandler<ButtonInteraction> = {
    customId: /^modmail_close_\d+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferReply();

        const threadId = interaction.customId.replace("modmail_close_", "");

        const modmail = await ModMailRepository.findByThreadId(threadId);
        if (!modmail || modmail.status !== "open") {
            await interaction.deleteReply().catch(() => {});
            await interaction.followUp({
                content: messages.errors.thread_already_closed,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const thread = interaction.channel as ThreadChannel;
        await closeModMail(modmail, interaction.user.id, client, thread);

        await interaction.editReply({ content: messages.success.thread_closed });
    },
};

export default modmailCloseBtn;
