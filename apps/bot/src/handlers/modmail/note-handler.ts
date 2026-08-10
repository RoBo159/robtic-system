import { EmbedBuilder, type Message } from "discord.js";
import { NoteRepository } from "@database/repositories/NoteRepository";
import { COLORS } from "@constants";
import type { IModMailThread } from "@database/models/ModMailThread";
import messages from "../../utils/modmail/messages.json";

export async function handleNoteCommand(message: Message, modmail: IModMailThread) {
    const notes = await NoteRepository.findByUser(modmail.userId);

    if (!notes.length) {
        await message.reply({ content: messages.errors.no_notes_found });
        return;
    }

    const noteLines = notes.map((n, i) =>
        `**${i + 1}.** ${n.content}\n   — <@${n.createdBy}> • <t:${Math.floor(n.createdAt.getTime() / 1000)}:R>`
    ).join("\n\n");

    const embed = new EmbedBuilder()
        .setTitle(messages.embed.notes_title.replace("{userId}", modmail.userId))
        .setDescription(noteLines)
        .setColor(COLORS.warning)
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}
