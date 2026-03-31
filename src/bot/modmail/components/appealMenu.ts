import {
    StringSelectMenuInteraction,
    ButtonInteraction,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
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

function buildAppealModal(userId: string, caseId: string, lang: Lang): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(`modmail_appeal_sub_${caseId}_${userId}_${lang}`)
        .setTitle(t("modmail.appeal_title", lang));

    modal.addComponents(
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

function normalizeLang(value: string | undefined): Lang {
    return value === "ar" ? "ar" : "en";
}

async function buildPunishmentsView(userId: string, lang: Lang) {
    const guildId = process.env.MainGuild!;
    const punishments = await PunishmentRepository.findActiveByUser(userId, guildId);

    if (!punishments.length) {
        return { punishments, embed: null, row: null };
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

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`modmail_appeal_case_${userId}_${lang}`)
            .setPlaceholder(t("modmail.appeal_case_label", lang))
            .addOptions(
                punishments.slice(0, 25).map(p => ({
                    label: `${p.caseId} (${p.type})`.slice(0, 100),
                    description: p.reason.slice(0, 100),
                    value: p.caseId,
                }))
            )
    );

    return { punishments, embed, row };
}

export const appealMenuSelect: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^modmail_appeal_menu_\d+_(en|ar)$/,

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const userId = parts[3];
        const lang = normalizeLang(parts[4]);

        if (interaction.user.id !== userId) {
            await interaction.reply({
                content: messages.errors.menu_not_for_you,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const view = await buildPunishmentsView(userId, lang);
        if (!view.punishments.length || !view.embed || !view.row) {
            await interaction.update({
                content: t("modmail.no_active_punishments", lang),
                embeds: [],
                components: [],
            });
            pendingSessions.delete(userId);
            return;
        }

        const selected = interaction.values[0];
        const prompt = selected === "knowreason"
            ? t("modmail.appeal_select_prompt", lang)
            : `${t("modmail.appeal_request", lang)}: ${t("modmail.appeal_select_prompt", lang)}`;

        await interaction.update({
            content: prompt,
            embeds: [view.embed],
            components: [view.row],
        });
        pendingSessions.delete(userId);
    },
};

export const appealCaseSelect: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^modmail_appeal_case_\d+_(en|ar)$/,

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const userId = parts[3];
        const lang = normalizeLang(parts[4]);

        if (interaction.user.id !== userId) {
            await interaction.reply({
                content: messages.errors.menu_not_for_you,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const selectedCaseId = interaction.values[0];
        const punishment = await PunishmentRepository.findByCaseId(selectedCaseId);

        if (!punishment || punishment.userId !== userId || !punishment.active) {
            await interaction.reply({
                content: t("modmail.no_active_punishments", lang),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const modal = buildAppealModal(userId, selectedCaseId, lang);
        await interaction.showModal(modal);
    },
};

export const appealFormButton: ComponentHandler<ButtonInteraction> = {
    customId: /^modmail_appeal_btn_\d+_\w+_(en|ar)$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");

        const userId = parts[3];
        const appealType = parts[4];
        const lang = normalizeLang(parts[5]);

        Logger.debug(`Appeal form button clicked by ${interaction.user.tag} for userId ${userId} with appeal type ${appealType} with lang ${lang}`); // Debug log

        if (interaction.user.id !== userId) {
            await interaction.reply({
                content: messages.errors.menu_not_for_you,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const view = await buildPunishmentsView(userId, lang);
        if (!view.punishments.length || !view.embed || !view.row) {
            await interaction.reply({
                content: t("modmail.no_active_punishments", lang),
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.update({
            content: `${t("modmail.appeal_request", lang)}: ${t("modmail.appeal_select_prompt", lang)}`,
            embeds: [view.embed],
            components: [view.row],
        });
    },
};
