import { ButtonInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { buildPunishmentsView } from "../../utils/modmail/punishments-view";
import { t, type Lang } from "@bot/utils/lang";
import messages from "../../utils/modmail/messages.json";

function normalizeLang(value: string | undefined): Lang {
    return value === "ar" ? "ar" : "en";
}

const appealFormButton: ComponentHandler<ButtonInteraction> = {
    customId: /^modmail_appeal_btn_\d+_\w+_(en|ar)$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferUpdate();

        const parts = interaction.customId.split("_");
        const userId = parts[3];
        const lang = normalizeLang(parts[5]);

        if (interaction.user.id !== userId) {
            await interaction.followUp({ content: messages.errors.menu_not_for_you, flags: MessageFlags.Ephemeral });
            return;
        }

        const view = await buildPunishmentsView(userId, lang);
        if (!view.punishments.length || !view.embed || !view.row) {
            await interaction.followUp({ content: t("modmail.no_active_punishments", lang), flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.editReply({
            content: `${t("modmail.appeal_request", lang)}: ${t("modmail.appeal_select_prompt", lang)}`,
            embeds: [view.embed],
            components: [view.row],
        });
    },
};

export default appealFormButton;
