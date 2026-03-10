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

const reportSubmit: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^modmail_report_\d+_(en|ar)$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const userId = parts[2];
        const lang = parts[3] as Lang;

        const reportedUser = interaction.fields.getTextInputValue("reported_user").trim();
        const reason = interaction.fields.getTextInputValue("report_reason").trim();
        const evidence = interaction.fields.getTextInputValue("report_evidence")?.trim() || "N/A";

        const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
        const reportChannel = staffGuild?.channels.cache.get(data.report_channel_id) as TextChannel | undefined;

        const reportEmbed = new EmbedBuilder()
            .setTitle("🚨 User Report")
            .setColor(Colors.warning)
            .addFields(
                { name: "Reporter", value: `<@${userId}> (${userId})`, inline: true },
                { name: "Reported User", value: reportedUser, inline: true },
                { name: "Language", value: lang === "ar" ? "🇸🇦 العربية" : "🇬🇧 English", inline: true },
                { name: "Reason", value: reason },
                { name: "Evidence", value: evidence },
            )
            .setTimestamp();

        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`report_approve_${userId}_${lang}`)
                .setLabel("Approve")
                .setStyle(ButtonStyle.Success)
                .setEmoji("✅"),
            new ButtonBuilder()
                .setCustomId(`report_deny_${userId}_${lang}`)
                .setLabel("Deny")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("❌"),
            new ButtonBuilder()
                .setCustomId(`report_investigate_${userId}_${lang}`)
                .setLabel("Open Investigation")
                .setStyle(ButtonStyle.Primary)
                .setEmoji("🔍"),
        );

        if (reportChannel) {
            await reportChannel.send({ embeds: [reportEmbed], components: [buttons] });
        }

        await interaction.reply({
            content: t("modmail.report_submitted", lang),
        });
    },
};

export default reportSubmit;
