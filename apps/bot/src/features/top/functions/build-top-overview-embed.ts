import { EmbedBuilder, type Guild } from "discord.js";
import {
    COLORS,
    TOP_PAGES,
    TOP_CATEGORY_EMOJI,
    TOP_DISPLAY_LIMIT,
    type ComboLeaderboardPeriod,
} from "@constants";
import type { Lang } from "@typings/lang";
import { t } from "@bot/utils/lang";
import { buildRankPage } from "../utils/rank-lines";

/** How many pages the overview has. */
export const overviewPageCount = (): number => TOP_PAGES.length;

/**
 * One page of the overview: two or three boards, top five each.
 *
 * It used to render every category at once, which made each board five rows in a column too narrow
 * to read and pushed the embed toward its limits. Paging is what lets each board keep its own
 * space, and the buttons make the rest one click away rather than absent.
 */
export async function buildTopOverviewEmbed(
    guild: Guild,
    period: ComboLeaderboardPeriod,
    lang: Lang,
    viewerId: string | undefined,
    page = 0,
): Promise<EmbedBuilder> {
    const index = Math.min(Math.max(0, page), TOP_PAGES.length - 1);
    const categories = TOP_PAGES[index]!;

    const embed = new EmbedBuilder()
        .setTitle(t("top.overview_title", lang, { period: t(`top.period_${period}`, lang), guild: guild.name }))
        .setColor(COLORS.activity)
        .setFooter({ text: t("top.page_footer", lang, { page: `${index + 1}`, pages: `${TOP_PAGES.length}` }) })
        .setTimestamp();

    for (const category of categories) {
        const { lines } = await buildRankPage(guild.id, category, period, t(`top.unit_${category}`, lang), {
            pageSize: TOP_DISPLAY_LIMIT,
            viewerId,
        });

        embed.addFields({
            name: `${TOP_CATEGORY_EMOJI[category]} ${t(`top.category_${category}`, lang)}`,
            value: (lines.join("\n") || t("top.no_entries", lang)).slice(0, 1024),
            // Two or three boards side by side; a fourth would wrap and break the columns.
            inline: true,
        });
    }

    return embed;
}
