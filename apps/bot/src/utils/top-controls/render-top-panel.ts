import type { GuildMember, StringSelectMenuInteraction } from "discord.js";
import type { ComboLeaderboardPeriod, TopCategory } from "@constants";
import { getUserLang } from "@bot/utils/lang";
import { buildTopEmbed } from "../../services/top";
import { buildTopCategoryRow } from "./build-top-category-row";
import { buildTopPeriodRow } from "./build-top-period-row";

export async function renderTopPanel(
    interaction: StringSelectMenuInteraction,
    invokerId: string,
    category: TopCategory,
    period: ComboLeaderboardPeriod,
): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;

    await interaction.deferUpdate();

    const lang = await getUserLang(interaction.member as GuildMember | null);
    const embed = await buildTopEmbed(guild, category, period, lang, invokerId);

    await interaction.editReply({
        embeds: [embed],
        components: [buildTopCategoryRow(invokerId, category, period, lang), buildTopPeriodRow(invokerId, category, period, lang)],
    });
}
