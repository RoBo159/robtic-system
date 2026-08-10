import {
    ButtonInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";

import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS } from "@constants";
import { NoteRepository } from "@database/repositories/NoteRepository";
import messages from "../../utils/modmail/messages.json";

const modmailNotes: ComponentHandler<ButtonInteraction> = {
    customId: /^modmail_notes_\d+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const userId = interaction.customId.replace("modmail_notes_", "");

        const notes = await NoteRepository.findByUser(userId);

        if (!notes.length) {
            await interaction.editReply({
                content: messages.errors.no_notes_found,
            });
            return;
        }

        const noteLines = notes.map((n, i) =>
            `**${i + 1}.** ${n.content}\n   — <@${n.createdBy}> • <t:${Math.floor(n.createdAt.getTime() / 1000)}:R>`
        ).join("\n\n");

        const embed = new EmbedBuilder()
            .setTitle(messages.embed.notes_title.replace("{userId}", userId))
            .setDescription(noteLines)
            .setColor(COLORS.warning)
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
        });
    },
};

export default modmailNotes;
