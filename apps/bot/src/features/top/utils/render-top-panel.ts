import type {
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder,
    Guild,
    GuildMember,
    MessageComponentInteraction,
    StringSelectMenuBuilder,
} from "discord.js";
import { TOP_ALL_CATEGORIES, type ComboLeaderboardPeriod } from "@constants";
import type { Lang } from "@typings/lang";
import { getUserLang } from "@bot/utils/lang";
import { buildTopEmbed, detailPageCount } from "../functions/build-top-embed";
import { buildTopOverviewEmbed, overviewPageCount } from "../functions/build-top-overview-embed";
import { buildTopPeriodRow, buildTopNavRow, type TopScope } from "./build-top-period-row";

export type TopRows = (ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>)[];

/** How many pages a scope has. The overview pages over groups of boards; a board pages over ranks. */
export const pageCountFor = (scope: TopScope): number =>
    scope === TOP_ALL_CATEGORIES ? overviewPageCount() : detailPageCount();

/** The overview or one board, depending on scope — the single place that decides which. */
export function buildTopScopeEmbed(
    guild: Guild,
    scope: TopScope,
    period: ComboLeaderboardPeriod,
    lang: Lang,
    viewerId: string,
    page: number,
): Promise<EmbedBuilder> {
    return scope === TOP_ALL_CATEGORIES
        ? buildTopOverviewEmbed(guild, period, lang, viewerId, page)
        : buildTopEmbed(guild, scope, period, lang, viewerId, page);
}

/**
 * The whole panel: the embed, the page buttons, then the period menu.
 *
 * Buttons above the menu on purpose — paging is the frequent action and select menus are the taller
 * control, so putting the menu last keeps the thing you click most next to what you are reading.
 */
export function buildTopComponents(
    invokerId: string,
    scope: TopScope,
    period: ComboLeaderboardPeriod,
    lang: Lang,
    page: number,
): TopRows {
    return [
        buildTopNavRow(invokerId, scope, period, lang, page, pageCountFor(scope)),
        buildTopPeriodRow(invokerId, scope, period, lang, page),
    ];
}

/** Redraws the panel in place, keeping whatever scope, page and period it was left on. */
export async function renderTopPanel(
    interaction: MessageComponentInteraction,
    invokerId: string,
    scope: TopScope,
    period: ComboLeaderboardPeriod,
    page: number,
): Promise<void> {
    const guild = interaction.guild;
    if (!guild) return;

    await interaction.deferUpdate();

    const lang = await getUserLang(interaction.member as GuildMember | null);
    const embed = await buildTopScopeEmbed(guild, scope, period, lang, invokerId, page);

    await interaction.editReply({
        embeds: [embed],
        components: buildTopComponents(invokerId, scope, period, lang, page),
    });
}
