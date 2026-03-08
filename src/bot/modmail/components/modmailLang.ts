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
                    messages.dm[language].type_placeholder
                )
                .addOptions(
                    { label: messages.dm[language].support, value: "support", emoji: "🛠️" },
                    { label: messages.dm[language].report, value: "report", emoji: "🚨" },
                    { label: messages.dm[language].appeal, value: "appeal", emoji: "📝" },
                )
        );

        await interaction.update({
            content: messages.dm[language].language_selected,
            components: [typeRow],
        });
    },
};

export default modmailLang;
