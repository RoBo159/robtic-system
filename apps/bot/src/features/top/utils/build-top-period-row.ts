import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { COMBO_LEADERBOARD_PERIODS, TOP_ALL_CATEGORIES, type ComboLeaderboardPeriod, type TopCategory } from "@constants";
import type { Lang } from "@typings/lang";
import { t } from "@bot/utils/lang";

/** `all` on the overview, a category name on a single board — the panel redraws whichever it was. */
export type TopScope = TopCategory | typeof TOP_ALL_CATEGORIES;

/**
 * The period switcher, and the only menu on the panel.
 *
 * There used to be a second one for swapping category, which is now what `/top <category>` is for —
 * a menu that silently changed which board you were reading was easy to leave in the wrong state.
 */
export function buildTopPeriodRow(
    invokerId: string,
    scope: TopScope,
    period: ComboLeaderboardPeriod,
    lang: Lang,
): ActionRowBuilder<StringSelectMenuBuilder> {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`top:period:${invokerId}:${scope}`)
        .setPlaceholder(t("top.period_placeholder", lang))
        .addOptions(COMBO_LEADERBOARD_PERIODS.map(p => ({
            label: t(`top.period_${p}`, lang),
            value: p,
            default: p === period,
        })));

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}
