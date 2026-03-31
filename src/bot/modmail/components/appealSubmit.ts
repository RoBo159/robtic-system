import {
    ModalSubmitInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { Colors } from "@core/config";
import data from "@shared/data.json";
import { t, type Lang } from "@shared/utils/lang";
import { PunishmentRepository } from "@database/repositories";

const appealSubmit: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^modmail_appeal_sub_[A-Za-z0-9-]+_\d+_(en|ar)$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const caseId = parts[3];
        const userId = parts[4];
        const lang = (parts[5] === "ar" ? "ar" : "en") as Lang;

        const reason = interaction.fields.getTextInputValue("appeal_reason").trim();
        const details = interaction.fields.getTextInputValue("appeal_details")?.trim() || "N/A";

        const punishment = await PunishmentRepository.findByCaseId(caseId);
        if (!punishment || punishment.userId !== userId || !punishment.active) {
            await interaction.reply({
                content: t("modmail.no_active_punishments", lang),
                ephemeral: true,
            });
            return;
        }

        const typeLabels: Record<string, string> = {
            warn: "⚠️ Warning Appeal",
            mute: "🔇 Mute Appeal",
            ban: "🔨 Ban Appeal",
            tempban: "🔨 Temporary Ban Appeal",
        };

        const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
        const appealsChannel = (
            staffGuild?.channels.cache.get(data.appeals_case_channel_id)
            ?? staffGuild?.channels.cache.get(data.punishments_case_channel_id)
            ?? staffGuild?.channels.cache.get(data.report_channel_id)
        ) as TextChannel | undefined;

        if (!appealsChannel) {
            await interaction.reply({
                content: "Staff appeal channel was not found. Please contact an administrator.",
                ephemeral: true,
            });
            return;
        }

        const appealEmbed = new EmbedBuilder()
            .setTitle(`📋 ${typeLabels[punishment.type] ?? "Appeal Request"}`)
            .setColor(Colors.info)
            .addFields(
                { name: "User", value: `<@${userId}> (${userId})`, inline: true },
                { name: "Type", value: typeLabels[punishment.type] ?? punishment.type, inline: true },
                { name: "Language", value: lang === "ar" ? "🇸🇦 العربية" : "🇬🇧 English", inline: true },
                { name: "Case ID", value: caseId, inline: true },
                { name: "Reason", value: reason },
                { name: "Additional Details", value: details },
            )
            .setTimestamp();

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`appeal_approvepoints_${caseId}_${userId}_${lang}`)
                .setLabel("Approve + Remove Points")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅"),
            new ButtonBuilder()
                .setCustomId(`appeal_approvenopoints_${caseId}_${userId}_${lang}`)
                .setLabel("Approve (Keep Points)")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🛡️"),
            new ButtonBuilder()
                .setCustomId(`appeal_deny_${caseId}_${userId}_${lang}`)
                .setLabel("Deny")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌"),
            new ButtonBuilder()
                .setCustomId(`appeal_openchat_${caseId}_${userId}_${lang}`)
                .setLabel("Open Chat")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("💬"),
            new ButtonBuilder()
                .setCustomId(`appeal_note_${caseId}_${userId}`)
                .setLabel("Add Note")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("📝"),
        );

        await appealsChannel.send({ embeds: [appealEmbed], components: [buttons] });

        await interaction.reply({
            content: t("modmail.appeal_submitted", lang),
            ephemeral: true,
        });
    },
};

export default appealSubmit;
