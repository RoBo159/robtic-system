import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js";
import {
    COMBO_LEADERBOARD_PERIODS,
    TOP_ALL_CATEGORIES,
    type ComboLeaderboardPeriod,
    type TopCategory,
} from "@constants";
import type { Lang } from "@typings/lang";
import { t } from "@bot/utils/lang";

/** `all` on the overview, a category name on a single board — the panel redraws whichever it was. */
export type TopScope = TopCategory | typeof TOP_ALL_CATEGORIES;

/**
 * The period switcher.
 *
 * Carries the page as well as the scope, so changing period keeps you on the page you were reading
 * instead of throwing you back to the first one.
 */
export function buildTopPeriodRow(
    invokerId: string,
    scope: TopScope,
    period: ComboLeaderboardPeriod,
    lang: Lang,
    page = 0,
): ActionRowBuilder<StringSelectMenuBuilder> {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`top:period:${invokerId}:${scope}:${page}`)
        .setPlaceholder(t("top.period_placeholder", lang))
        .addOptions(COMBO_LEADERBOARD_PERIODS.map(p => ({
            label: t(`top.period_${p}`, lang),
            value: p,
            default: p === period,
        })));

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/**
 * Previous / next, above the period menu.
 *
 * The target page is baked into each button's id rather than a direction, so a click cannot land on
 * the wrong page because the message was stale. On the overview these move between groups of
 * boards; on a single board they move down the ranking.
 */
export function buildTopNavRow(
    invokerId: string,
    scope: TopScope,
    period: ComboLeaderboardPeriod,
    lang: Lang,
    page: number,
    pageCount: number,
): ActionRowBuilder<ButtonBuilder> {
    const previous = Math.max(0, page - 1);
    const next = Math.min(pageCount - 1, page + 1);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`top:nav:${invokerId}:${scope}:${previous}:${period}`)
            .setLabel(t("top.prev_button", lang))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),
        new ButtonBuilder()
            .setCustomId(`top:nav:${invokerId}:${scope}:${next}:${period}`)
            .setLabel(t("top.next_button", lang))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= pageCount - 1),
    );
}
