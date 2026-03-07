import {
    StringSelectMenuInteraction,
    TextChannel,
    MessageFlags,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";

import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { Colors } from "@core/config";
import data from "@shared/data.json";
import { pendingSessions } from "../utils/handleModMailDM";
import messages from "../utils/messages.json";

const modmailType: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^modmail_type_\d+$/,

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        const userId = interaction.customId.split("_")[2];

        if (interaction.user.id !== userId) {
            await interaction.reply({
                content: messages.errors.menu_not_for_you,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const session = pendingSessions.get(userId);
        if (!session || !session.language) {
            await interaction.reply({
                content: messages.errors.session_expired,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const requestType = interaction.values[0] as "appeal" | "report" | "support";
        const language = session.language;

        const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
        const staffChannel = staffGuild?.channels.cache.get(data.modmail_channel_id) as TextChannel;

        if (!staffChannel) {
            await interaction.update({
                content: messages.errors.staff_channel_not_found,
                components: [],
            });
            pendingSessions.delete(userId);
            return;
        }

        const thread = await staffChannel.threads.create({
            name: `modmail-${interaction.user.username}`,
            autoArchiveDuration: 1440,
            reason: `ModMail from ${interaction.user.tag}`,
        });

        await ModMailRepository.create({
            userId,
            threadId: thread.id,
            guildId: staffGuild!.id,
            staffChannelId: staffChannel.id,
            language,
            requestType,
        });

        const typeLabels: Record<string, string> = { support: messages.embed.type_support, report: messages.embed.type_report, appeal: messages.embed.type_appeal };

        const infoEmbed = new EmbedBuilder()
            .setTitle(messages.embed.new_modmail_title)
            .setColor(Colors.info)
            .addFields(
                { name: "User", value: `<@${userId}>`, inline: true },
                { name: "Tag", value: interaction.user.tag, inline: true },
                { name: "User ID", value: userId, inline: true },
                { name: "Language", value: language === "ar" ? messages.embed.lang_ar : messages.embed.lang_en, inline: true },
                { name: "Type", value: typeLabels[requestType], inline: true },
                { name: "Status", value: messages.embed.status_unclaimed, inline: true },
            )
            .setThumbnail(interaction.user.displayAvatarURL())
            .setTimestamp();

        const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`modmail_claim_${thread.id}`)
                .setLabel("Claim")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✋"),
            new ButtonBuilder()
                .setCustomId(`modmail_notes_${userId}`)
                .setLabel("Notes")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("📝"),
            new ButtonBuilder()
                .setCustomId(`modmail_close_${thread.id}`)
                .setLabel("Close")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔒"),
        );

        await thread.send({ embeds: [infoEmbed], components: [buttonRow] });

        if (session.content || session.attachments.length) {
            await thread.send({
                content: `**User:** ${session.content || "📎 Attachment"}`,
                files: session.attachments,
            });

            await ModMailRepository.addMessage(
                thread.id,
                userId,
                "user",
                session.content,
                session.attachments,
            );
        }

        pendingSessions.delete(userId);

        const confirmMsg = language === "ar"
            ? messages.dm.thread_created_ar
            : messages.dm.thread_created_en;

        await interaction.update({
            content: confirmMsg,
            components: [],
        });
    },
};

export default modmailType;
