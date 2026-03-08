import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    TextChannel,
    type ThreadChannel,
} from "discord.js";
import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/BotClient";
import type { IModMailThread } from "@database/models/ModMailThread";
import { Colors, STAFF_TEAM_ROLE_ID } from "@core/config";
import data from "@shared/data.json";
import messages from "./messages.json";
import { getTranscriptUrl } from "../../../api/server";

export async function closeModMail(
    modmail: IModMailThread,
    closedById: string,
    client: BotClient,
    thread?: ThreadChannel | null,
) {
    const closed = await ModMailRepository.close(modmail.threadId, closedById);
    if (!closed) return;

    const user = await client.users.fetch(modmail.userId).catch(() => null);
    const closer = await client.users.fetch(closedById).catch(() => null);

    if (user) {
        await user.send({
            content: messages.dm[modmail.language].thread_closed_user,
        }).catch(() => null);
    }

    const typeLabels: Record<string, string> = { support: messages.embed.type_support, report: messages.embed.type_report, appeal: messages.embed.type_appeal };
    const userMessages = modmail.messages.filter(m => m.authorType === "user").length;
    const staffMessages = modmail.messages.filter(m => m.authorType === "staff").length;
    const totalAttachments = modmail.messages.reduce((sum, m) => sum + m.attachments.length, 0);

    const logEmbed = new EmbedBuilder()
        .setTitle(messages.embed.modmail_closed_title)
        .setColor(Colors.moderation)
        .addFields(
            { name: "User", value: `<@${modmail.userId}> (${modmail.userId})`, inline: true },
            { name: "Claimed By", value: modmail.claimedBy ? `<@${modmail.claimedBy}>` : "Unclaimed", inline: true },
            { name: "Closed By", value: closer ? `<@${closedById}>` : closedById, inline: true },
            { name: "Type", value: typeLabels[modmail.requestType] || modmail.requestType, inline: true },
            { name: "Language", value: modmail.language === "ar" ? messages.embed.lang_ar : messages.embed.lang_en, inline: true },
            { name: "Thread ID", value: modmail.threadId, inline: true },
            { name: "User Messages", value: `${userMessages}`, inline: true },
            { name: "Staff Messages", value: `${staffMessages}`, inline: true },
            { name: "Total Attachments", value: `${totalAttachments}`, inline: true },
            { name: "Opened At", value: `<t:${Math.floor(modmail.createdAt.getTime() / 1000)}:F>`, inline: true },
            { name: "Closed At", value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
        )
        .setTimestamp();

    const transcriptButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setLabel("📄 View Transcript")
            .setStyle(ButtonStyle.Link)
            .setURL(getTranscriptUrl(modmail.threadId)),
    );

    const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
    const logChannel = staffGuild?.channels.cache.get(data.modmail_log_channel_id) as TextChannel | undefined;

    if (logChannel) {
        await logChannel.send({ embeds: [logEmbed], components: [transcriptButton] }).catch(() => null);
    }

    if (thread) {
        await thread.send({ content: messages.thread.thread_locked_notice, embeds: [logEmbed], components: [transcriptButton] }).catch(() => null);

        const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
        if (staffGuild) {
            const staffRole = staffGuild.roles.cache.get(STAFF_TEAM_ROLE_ID);
            if (staffRole) {
                await thread.members.fetch().catch(() => null);
                for (const [, threadMember] of thread.members.cache) {
                    if (threadMember.id === client.user?.id) continue;
                    await thread.members.remove(threadMember.id).catch(() => null);
                }
            }
        }

        await thread.setLocked(true).catch(() => null);
        await thread.setArchived(true).catch(() => null);
    }
}
