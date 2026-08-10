import {
    ModalSubmitInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS } from "@constants";
import { getLogChannel } from "@bot/utils/server-log";
import { t, type Lang } from "@bot/utils/lang";
import { PunishmentRepository } from "@database/repositories";

const appealSubmit: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^modmail_appeal_sub_[A-Za-z0-9-]+_\d+_(en|ar)$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const parts = interaction.customId.split("_");
        const caseId = parts[3];
        const userId = parts[4];
        const lang = (parts[5] === "ar" ? "ar" : "en") as Lang;

        const reason = interaction.fields.getTextInputValue("appeal_reason").trim();
        const details = interaction.fields.getTextInputValue("appeal_details")?.trim() || "N/A";

        const punishment = await PunishmentRepository.findByCaseId(caseId);
        if (!punishment || punishment.userId !== userId || !punishment.active) {
            await interaction.editReply({
                content: t("modmail.no_active_punishments", lang),
            });
            return;
        }

        const typeLabels: Record<string, string> = {
            warn: "⚠️ Warning Appeal",
            mute: "🔇 Mute Appeal",
            ban: "🔨 Ban Appeal",
            tempban: "🔨 Temporary Ban Appeal",
        };

        const appealsChannel = (
            await getLogChannel(client, "appeals_case")
            ?? await getLogChannel(client, "punishments_case")
            ?? await getLogChannel(client, "report")
        ) as TextChannel | null;

        if (!appealsChannel) {
            await interaction.editReply({
                content: "Staff appeal channel was not found. Please contact an administrator.",
            });
            return;
        }

        const appealEmbed = new EmbedBuilder()
            .setTitle(`📋 ${typeLabels[punishment.type] ?? "Appeal Request"}`)
            .setColor(COLORS.info)
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

        await interaction.editReply({
            content: t("modmail.appeal_submitted", lang),
        });
    },
};

export default appealSubmit;
