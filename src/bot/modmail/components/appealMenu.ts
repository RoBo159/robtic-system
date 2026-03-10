import {
    StringSelectMenuInteraction,
    ButtonInteraction,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { Colors } from "@core/config";
import { PunishmentRepository } from "@database/repositories";
import { t, type Lang } from "@shared/utils/lang";
import { pendingSessions } from "../utils/handleModMailDM";
import messages from "../utils/messages.json";
import { Logger } from "@core/libs";

function buildAppealModal(userId: string, appealType: string, lang: Lang): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(`modmail_appeal_sub_${appealType}_${userId}_${lang}`)
        .setTitle(t("modmail.appeal_title", lang));

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("appeal_case")
                .setLabel(t("modmail.appeal_case_label", lang))
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(50)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("appeal_reason")
                .setLabel(t("modmail.appeal_reason_label", lang))
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId("appeal_details")
                .setLabel(t("modmail.appeal_details_label", lang))
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(1000)
        ),
    );

    return modal;
}

export const appealMenuSelect: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^modmail_appeal_menu_\d+_(en|ar)$/,

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const userId = parts[3];
        const lang = parts[4] as Lang;

        if (interaction.user.id !== userId) {
            await interaction.reply({
                content: messages.errors.menu_not_for_you,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const selected = interaction.values[0];

        if (selected === "knowreason") {
            const guildId = process.env.MainGuild!;
            const punishments = await PunishmentRepository.findActiveByUser(userId, guildId);

            if (!punishments.length) {
                await interaction.update({
                    content: t("modmail.no_active_punishments", lang),
                    components: [],
                });
                pendingSessions.delete(userId);
                return;
            }

            const typeEmojis: Record<string, string> = { warn: "⚠️", mute: "🔇", ban: "🔨", tempban: "🔨" };
            const lines = punishments.map((p, i) =>
                `**${i + 1}.** ${typeEmojis[p.type] ?? "📌"} \`${p.caseId}\` — ${p.reason}`
            );

            const embed = new EmbedBuilder()
                .setTitle(t("modmail.active_punishments_title", lang))
                .setDescription(lines.join("\n"))
                .setColor(Colors.warning)
                .setTimestamp();

            const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`modmail_appeal_btn_${userId}_appealrequest_${lang}`)
                    .setLabel(t("modmail.appeal_request", lang))
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📝"),
            );

            await interaction.update({
                content: "",
                embeds: [embed],
                components: [buttons],
            });
            return;
        }

        const modal = buildAppealModal(userId, selected, lang);
        await interaction.showModal(modal);
        pendingSessions.delete(userId);
    },
};

export const appealFormButton: ComponentHandler<ButtonInteraction> = {
    customId: /^modmail_appeal_btn_\d+_\w+_(en|ar)$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");

        const userId = parts[3];
        const appealType = parts[5];
        const lang = parts[6] as Lang;

        Logger.debug(`Appeal form button clicked by ${interaction.user.tag} for userId ${userId} with appeal type ${appealType} with lang ${lang}`); // Debug log

        if (interaction.user.id !== userId) {
            await interaction.reply({
                content: messages.errors.menu_not_for_you,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const modal = buildAppealModal(userId, appealType, lang);
        await interaction.showModal(modal);
    },
};
