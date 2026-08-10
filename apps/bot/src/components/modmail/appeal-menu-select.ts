import { StringSelectMenuInteraction, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { buildPunishmentsView } from "../../utils/modmail/punishments-view";
import { pendingSessions } from "../../sessions/modmail/pending-sessions";
import { t, type Lang } from "@bot/utils/lang";
import messages from "../../utils/modmail/messages.json";

function normalizeLang(value: string | undefined): Lang {
    return value === "ar" ? "ar" : "en";
}

const appealMenuSelect: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^modmail_appeal_menu_\d+_(en|ar)$/,

    async run(interaction: StringSelectMenuInteraction, client: BotClient) {
        await interaction.deferUpdate();

        const parts = interaction.customId.split("_");
        const userId = parts[3];
        const lang = normalizeLang(parts[4]);

        if (interaction.user.id !== userId) {
            await interaction.followUp({ content: messages.errors.menu_not_for_you, flags: MessageFlags.Ephemeral });
            return;
        }

        const view = await buildPunishmentsView(userId, lang);
        if (!view.punishments.length || !view.embed || !view.row) {
            await interaction.editReply({ content: t("modmail.no_active_punishments", lang), embeds: [], components: [] });
            pendingSessions.delete(userId);
            return;
        }

        const selected = interaction.values[0];
        const prompt = selected === "knowreason"
            ? t("modmail.appeal_select_prompt", lang)
            : `${t("modmail.appeal_request", lang)}: ${t("modmail.appeal_select_prompt", lang)}`;

        await interaction.editReply({ content: prompt, embeds: [view.embed], components: [view.row] });
        pendingSessions.delete(userId);
    },
};

export default appealMenuSelect;
