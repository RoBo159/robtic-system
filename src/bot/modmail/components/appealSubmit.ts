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

const appealSubmit: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^modmail_appeal_sub_\w+_\d+_(en|ar)$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const appealType = parts[3];
        const userId = parts[4];
        const lang = parts[5] as Lang;

        const caseId = interaction.fields.getTextInputValue("appeal_case")?.trim() || "N/A";
        const reason = interaction.fields.getTextInputValue("appeal_reason").trim();
        const details = interaction.fields.getTextInputValue("appeal_details")?.trim() || "N/A";

        const typeLabels: Record<string, string> = {
            banreview: "🔨 Ban Review",
            mutereview: "🔇 Mute Review",
            appealrequest: "📝 General Appeal",
        };

        const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
        const appealsChannel = staffGuild?.channels.cache.get(data.appeals_case_channel_id) as TextChannel | undefined;

        const appealEmbed = new EmbedBuilder()
            .setTitle(`📋 ${typeLabels[appealType] ?? "Appeal Request"}`)
            .setColor(Colors.info)
            .addFields(
                { name: "User", value: `<@${userId}> (${userId})`, inline: true },
                { name: "Type", value: typeLabels[appealType] ?? appealType, inline: true },
                { name: "Language", value: lang === "ar" ? "🇸🇦 العربية" : "🇬🇧 English", inline: true },
                { name: "Case ID", value: caseId, inline: true },
                { name: "Reason", value: reason },
                { name: "Additional Details", value: details },
            )
            .setTimestamp();

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`appeal_approve_${appealType}_${userId}_${lang}`)
                .setLabel("Approve")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅"),
            new ButtonBuilder()
                .setCustomId(`appeal_deny_${appealType}_${userId}_${lang}`)
                .setLabel("Deny")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌"),
            new ButtonBuilder()
                .setCustomId(`appeal_note_${userId}`)
                .setLabel("Add Note")
                .setStyle(ButtonStyle.Secondary)
                .setEmoji("📝"),
        );

        if (appealsChannel) {
            await appealsChannel.send({ embeds: [appealEmbed], components: [buttons] });
        }

        await interaction.reply({
            content: t("modmail.appeal_submitted", lang),
        });
    },
};

export default appealSubmit;
