import { EmbedBuilder, type Guild } from "discord.js";
import {
    COLORS,
    TOP_CATEGORY_EMOJI,
    TOP_DETAIL_LIMIT,
    VIEWER_RANK_SCAN_LIMIT,
    type ComboLeaderboardPeriod,
    type TopCategory,
} from "@constants";
import type { Lang } from "@typings/lang";
import { t } from "@bot/utils/lang";
import { buildRankPage } from "../utils/rank-lines";

/** How many pages of ten a single board can show before it runs out of scanned ranks. */
export const detailPageCount = (): number => Math.ceil(VIEWER_RANK_SCAN_LIMIT / TOP_DETAIL_LIMIT);

/**
 * One category in depth: ten ranks a page, and the reader's own row wherever it falls.
 *
 * Paging by rank rather than truncating at ten is what makes a big server's board usable — 40th
 * place can page down to see the company they are in, instead of only ever seeing the top and
 * their own line.
 */
export async function buildTopEmbed(
    guild: Guild,
    category: TopCategory,
    period: ComboLeaderboardPeriod,
    lang: Lang,
    viewerId?: string,
    page = 0,
): Promise<EmbedBuilder> {
    const index = Math.max(0, page);

    const { lines, viewerRank } = await buildRankPage(guild.id, category, period, t(`top.unit_${category}`, lang), {
        page: index,
        pageSize: TOP_DETAIL_LIMIT,
        viewerId,
    });

    const embed = new EmbedBuilder()
        .setTitle(t("top.title", lang, {
            emoji: TOP_CATEGORY_EMOJI[category],
            category: t(`top.category_${category}`, lang),
            period: t(`top.period_${period}`, lang),
            guild: guild.name,
        }))
        .setDescription(lines.join("\n") || t("top.no_entries", lang))
        .setColor(COLORS.activity)
        .setTimestamp();

    embed.setFooter({
        text: viewerRank > 0
            ? t("top.rank_footer", lang, { rank: `${viewerRank}`, page: `${index + 1}` })
            : t("top.unranked_footer", lang, { page: `${index + 1}` }),
    });

    return embed;
}
