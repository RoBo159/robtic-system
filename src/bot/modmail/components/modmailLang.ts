import {
    StringSelectMenuInteraction,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
} from "discord.js";

import type { BotClient } from "@core/BotClient";
import type { ComponentHandler } from "@core/config";
import { pendingSessions } from "../utils/handleModMailDM";
import messages from "../utils/messages.json";

const modmailLang: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^modmail_lang_\d+$/,

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
        if (!session) {
            await interaction.reply({
                content: messages.errors.session_expired,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const language = interaction.values[0] as "en" | "ar";
        session.language = language;

        const typeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`modmail_type_${userId}`)
                .setPlaceholder(
                    language === "ar"
                        ? messages.dm.type_placeholder_ar
                        : messages.dm.type_placeholder_en
                )
                .addOptions(
                    { label: language === "ar" ? messages.dm.support_ar : messages.dm.support_en, value: "support", emoji: "🛠️" },
                    { label: language === "ar" ? messages.dm.report_ar : messages.dm.report_en, value: "report", emoji: "🚨" },
                    { label: language === "ar" ? messages.dm.appeal_ar : messages.dm.appeal_en, value: "appeal", emoji: "📝" },
                )
        );

        await interaction.update({
            content: language === "ar"
                ? messages.dm.language_selected_ar
                : messages.dm.language_selected_en,
            components: [typeRow],
        });
    },
};

export default modmailLang;
