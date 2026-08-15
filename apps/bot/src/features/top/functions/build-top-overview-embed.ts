import { EmbedBuilder, type Guild } from "discord.js";
import {
    COLORS,
    TOP_CATEGORIES,
    TOP_CATEGORY_EMOJI,
    TOP_DISPLAY_LIMIT,
    type ComboLeaderboardPeriod,
} from "@constants";
import type { Lang } from "@typings/lang";
import { t } from "@bot/utils/lang";
import { getTopEntries } from "../lib";

/**
 * Every leaderboard at once, top five each, one field per category.
 *
 * Fields are inline so Discord lays them out in columns — xp | messages | combo — which is the
 * point of the overview: comparing the boards side by side rather than paging between them.
 */
export async function buildTopOverviewEmbed(
    guild: Guild,
    period: ComboLeaderboardPeriod,
    lang: Lang,
    viewerId?: string,
): Promise<EmbedBuilder> {
    const boards = await Promise.all(
        TOP_CATEGORIES.map(async category => ({
            category,
            entries: await getTopEntries(guild.id, category, period, TOP_DISPLAY_LIMIT),
        }))
    );

    const embed = new EmbedBuilder()
        .setTitle(t("top.overview_title", lang, { period: t(`top.period_${period}`, lang), guild: guild.name }))
        .setColor(COLORS.activity)
        .setFooter({ text: t("top.overview_footer", lang) })
        .setTimestamp();

    for (const { category, entries } of boards) {
        const lines = entries.map((entry, index) => {
            const line = `**${index + 1}.** <@${entry.discordId}> — ${entry.value}`;
            return entry.discordId === viewerId ? `__${line}__` : line;
        });

        embed.addFields({
            name: `${TOP_CATEGORY_EMOJI[category]} ${t(`top.category_${category}`, lang)}`,
            value: lines.join("\n") || t("top.no_entries", lang),
            inline: true,
        });
    }

    return embed;
}
