import {
    StringSelectMenuInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { PunishmentRepository } from "@database/repositories";
import { t, type Lang } from "@bot/utils/lang";
import messages from "../../utils/modmail/messages.json";

function normalizeLang(value: string | undefined): Lang {
    return value === "ar" ? "ar" : "en";
}

function buildAppealModal(userId: string, caseId: string, lang: Lang): ModalBuilder {
    return new ModalBuilder()
        .setCustomId(`modmail_appeal_sub_${caseId}_${userId}_${lang}`)
        .setTitle(t("modmail.appeal_title", lang))
        .addComponents(
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
}

const appealCaseSelect: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^modmail_appeal_case_\d+_(en|ar)$/,

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const userId = parts[3];
        const lang = normalizeLang(parts[4]);

        if (interaction.user.id !== userId) {
            await interaction.reply({ content: messages.errors.menu_not_for_you, flags: MessageFlags.Ephemeral });
            return;
        }

        const caseId = interaction.values[0];
        const punishment = await PunishmentRepository.findByCaseId(caseId);

        if (!punishment || punishment.userId !== userId || !punishment.active) {
            await interaction.reply({ content: t("modmail.no_active_punishments", lang), flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.showModal(buildAppealModal(userId, caseId, lang));
    },
};

export default appealCaseSelect;
