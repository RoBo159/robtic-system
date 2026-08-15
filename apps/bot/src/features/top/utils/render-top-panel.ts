import type { EmbedBuilder, Guild, GuildMember, StringSelectMenuInteraction } from "discord.js";
import { TOP_ALL_CATEGORIES, type ComboLeaderboardPeriod } from "@constants";
import type { Lang } from "@typings/lang";
import { getUserLang } from "@bot/utils/lang";
import { buildTopEmbed } from "../functions/build-top-embed";
import { buildTopOverviewEmbed } from "../functions/build-top-overview-embed";
import { buildTopPeriodRow, type TopScope } from "./build-top-period-row";

/** The overview or one board, depending on scope — the single place that decides which. */
export function buildTopScopeEmbed(
    guild: Guild,
    scope: TopScope,
    period: ComboLeaderboardPeriod,
    lang: Lang,
    viewerId: string,
): Promise<EmbedBuilder> {
    return scope === TOP_ALL_CATEGORIES
        ? buildTopOverviewEmbed(guild, period, lang, viewerId)
        : buildTopEmbed(guild, scope, period, lang, viewerId);
}

/** Redraws the panel in place after a period change, keeping whatever scope it was opened with. */
export async function renderTopPanel(
    interaction: StringSelectMenuInteraction,
    invokerId: string,
    scope: TopScope,
    period: ComboLeaderboardPeriod,
): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;

    await interaction.deferUpdate();

    const lang = await getUserLang(interaction.member as GuildMember | null);
    const embed = await buildTopScopeEmbed(guild, scope, period, lang, invokerId);

    await interaction.editReply({
        embeds: [embed],
        components: [buildTopPeriodRow(invokerId, scope, period, lang)],
    });
}
