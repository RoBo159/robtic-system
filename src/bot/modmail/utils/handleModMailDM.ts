import {
    Message,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    TextChannel
} from "discord.js";

import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/BotClient.ts";
import data from "@shared/data.json";
import messages from "./messages.json";

export interface PendingModMail {
    userId: string;
    content: string;
    attachments: string[];
    language?: "en" | "ar";
}

export const pendingSessions = new Map<string, PendingModMail>();

export async function handleModMailDM(message: Message, client: BotClient) {

    if (message.author.bot) return;

    const attachments = message.attachments.map(a => a.url);

    const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
    const staffChannel = staffGuild?.channels.cache.get(data.modmail_channel_id) as TextChannel;

    if (!staffChannel) return;

    const existing = await ModMailRepository.findOpenByUser(message.author.id);

    if (existing) {

        const thread = await staffChannel.threads.fetch(existing.threadId).catch(() => null);

        if (!thread) return;

        await ModMailRepository.addMessage(
            existing.threadId,
            message.author.id,
            "user",
            message.content,
            attachments
        );

        const parts: string[] = [];

        if (message.content)
            parts.push(`**${message.author.tag}**: ${message.content}`);

        if (attachments.length)
            parts.push(`📎 Attachment(s)`);

        await thread.send({
            content: parts.join("\n"),
            files: attachments
        });

        return;
    }

    if (pendingSessions.has(message.author.id)) {
        await message.author.send({
            content: messages.errors.already_pending
        });
        return;
    }

    pendingSessions.set(message.author.id, {
        userId: message.author.id,
        content: message.content,
        attachments,
    });

    const langRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`modmail_lang_${message.author.id}`)
            .setPlaceholder("Select language / اختر لغتك")
            .addOptions(
                { label: "English", value: "en", emoji: "🇬🇧" },
                { label: "العربية", value: "ar", emoji: "🇸🇦" }
            )
    );

    await message.author.send({
        content: messages.dm.select_language,
        components: [langRow]
    });
}