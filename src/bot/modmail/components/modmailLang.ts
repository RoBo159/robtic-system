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
import { t, type Lang } from "@shared/utils/lang";

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

        const language = interaction.values[0] as Lang;
        session.language = language;

        const typeRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`modmail_type_${userId}`)
                .setPlaceholder(
                    t("modmail.type_placeholder", language)
                )
                .addOptions(
                    { label: t("modmail.support", language), value: "support", emoji: "🛠️" },
                    { label: t("modmail.report", language), value: "report", emoji: "🚨" },
                    { label: t("modmail.appeal", language), value: "appeal", emoji: "📝" },
                )
        );

        await interaction.update({
            content: t("modmail.language_selected", language),
            components: [typeRow],
        });
    },
};

export default modmailLang;
