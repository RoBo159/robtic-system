import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { TOP_CATEGORIES, type ComboLeaderboardPeriod, type TopCategory } from "@constants";
import type { Lang } from "@typings/lang";
import { t } from "@bot/utils/lang";

export function buildTopCategoryRow(
    invokerId: string,
    category: TopCategory,
    period: ComboLeaderboardPeriod,
    lang: Lang,
): ActionRowBuilder<StringSelectMenuBuilder> {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(`top:category:${invokerId}:${period}`)
        .setPlaceholder(t("top.category_placeholder", lang))
        .addOptions(TOP_CATEGORIES.map(c => ({ label: t(`top.category_${c}`, lang), value: c, default: c === category })));

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}
