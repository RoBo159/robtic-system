import {
    ButtonInteraction,
    MessageFlags,
} from "discord.js";

import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import messages from "../utils/messages.json";
import { t } from "@shared/utils/lang";

const modmailClaim: ComponentHandler<ButtonInteraction> = {
    customId: /^modmail_claim_\d+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const threadId = interaction.customId.replace("modmail_claim_", "");

        const modmail = await ModMailRepository.findByThreadId(threadId);
        if (!modmail || modmail.status !== "open") {
            await interaction.reply({
                content: messages.errors.thread_no_longer_active,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (modmail.claimedBy) {
            await interaction.reply({
                content: messages.errors.already_claimed.replace("{userId}", modmail.claimedBy),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await ModMailRepository.claim(threadId, interaction.user.id);

        await interaction.reply({
            content: messages.success.thread_claimed.replace("{userId}", interaction.user.id),
        });

        const user = await client.users.fetch(modmail.userId).catch(() => null);
        if (!user) return;

        await user.send({
            content: t("modmail.staff_claimed", modmail.language as "en" | "ar"),
        }).catch(() => null);
    },
};

export default modmailClaim;
