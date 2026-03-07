import {
    ButtonInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";

import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { Colors } from "@core/config";
import { NoteRepository } from "@database/repositories/NoteRepository";
import messages from "../utils/messages.json";

const modmailNotes: ComponentHandler<ButtonInteraction> = {
    customId: /^modmail_notes_\d+$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const userId = interaction.customId.replace("modmail_notes_", "");

        const notes = await NoteRepository.findByUser(userId);

        if (!notes.length) {
            await interaction.reply({
                content: messages.errors.no_notes_found,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const noteLines = notes.map((n, i) =>
            `**${i + 1}.** ${n.content}\n   — <@${n.createdBy}> • <t:${Math.floor(n.createdAt.getTime() / 1000)}:R>`
        ).join("\n\n");

        const embed = new EmbedBuilder()
            .setTitle(messages.embed.notes_title.replace("{userId}", userId))
            .setDescription(noteLines)
            .setColor(Colors.warning)
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral,
        });
    },
};

export default modmailNotes;
