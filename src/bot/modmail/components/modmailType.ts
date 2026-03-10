import {
    StringSelectMenuInteraction,
    TextChannel,
    MessageFlags,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
} from "discord.js";

import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { Colors } from "@core/config";
import data from "@shared/data.json";
import { pendingSessions } from "../utils/handleModMailDM";
import messages from "../utils/messages.json";
import { t, type Lang } from "@shared/utils/lang";

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
        const language = session.language as Lang;

        if (requestType === "report") {
            const modal = new ModalBuilder()
                .setCustomId(`modmail_report_${userId}_${language}`)
                .setTitle(t("modmail.report_title", language));

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("reported_user")
                        .setLabel(t("modmail.report_user_label", language))
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(100)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("report_reason")
                        .setLabel(t("modmail.report_reason_label", language))
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(1000)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("report_evidence")
                        .setLabel(t("modmail.report_evidence_label", language))
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)
                        .setMaxLength(1000)
                ),
            );

            await interaction.showModal(modal);
            pendingSessions.delete(userId);
            return;
        }

        if (requestType === "appeal") {
            const appealRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`modmail_appeal_menu_${userId}_${language}`)
                    .setPlaceholder(t("modmail.appeal_placeholder", language))
                    .addOptions(
                        { label: t("modmail.appeal_know_reason", language), value: "knowreason", emoji: "🔍" },
                        { label: t("modmail.appeal_ban_review", language), value: "banreview", emoji: "🔨" },
                        { label: t("modmail.appeal_mute_review", language), value: "mutereview", emoji: "🔇" },
                        { label: t("modmail.appeal_request", language), value: "appealrequest", emoji: "📝" },
                    )
            );

            await interaction.update({
                content: t("modmail.appeal_select_prompt", language),
                components: [appealRow],
            });
            return;
        }

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

        await interaction.update({
            content: t("modmail.thread_created", language),
            components: [],
        });
    },
};

export default modmailType;
