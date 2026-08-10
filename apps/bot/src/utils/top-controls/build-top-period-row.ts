import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { COMBO_LEADERBOARD_PERIODS, type ComboLeaderboardPeriod, type TopCategory } from "@constants";
import type { Lang } from "@typings/lang";
import { t } from "@bot/utils/lang";

export function buildTopPeriodRow(
    invokerId: string,
    category: TopCategory,
    period: ComboLeaderboardPeriod,
    lang: Lang,
): ActionRowBuilder<StringSelectMenuBuilder> {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`top:period:${invokerId}:${category}`)
        .setPlaceholder(t("top.period_placeholder", lang))
        .addOptions(COMBO_LEADERBOARD_PERIODS.map(p => ({ label: t(`top.period_${p}`, lang), value: p, default: p === period })));

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}
