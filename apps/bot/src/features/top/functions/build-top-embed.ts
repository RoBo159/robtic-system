import { EmbedBuilder, type Guild } from "discord.js";
import {
    COLORS,
    TOP_CATEGORY_EMOJI,
    TOP_DISPLAY_LIMIT,
    VIEWER_RANK_SCAN_LIMIT,
    TOP_RANK_GAP_SEPARATOR,
    type ComboLeaderboardPeriod,
    type TopCategory,
} from "@constants";
import type { TopEntry } from "@typings/top";
import type { Lang } from "@typings/lang";
import { t } from "@bot/utils/lang";
import { getTopEntries } from "../lib";

function formatEntry(rank: number, entry: TopEntry, unit: string, isViewer: boolean): string {
    const line = `#${rank} <@${entry.discordId}> — ${entry.value} ${unit}`;
    return isViewer ? `**${line}**` : line;
}

/** `viewerId` bolds that member's line — inline in the top 5, or appended below (with a "...." separator past rank 6). */
export async function buildTopEmbed(
    guild: Guild,
    category: TopCategory,
    period: ComboLeaderboardPeriod,
    lang: Lang,
    viewerId?: string,
): Promise<EmbedBuilder> {
    const entries = await getTopEntries(guild.id, category, period, TOP_DISPLAY_LIMIT);
    const unit = t(`top.unit_${category}`, lang);

    const lines = entries.map((e, i) => formatEntry(i + 1, e, unit, e.discordId === viewerId));

    if (viewerId && !entries.some(e => e.discordId === viewerId)) {
        const scanned = await getTopEntries(guild.id, category, period, VIEWER_RANK_SCAN_LIMIT);
        const viewerIndex = scanned.findIndex(e => e.discordId === viewerId);

        if (viewerIndex !== -1) {
            const rank = viewerIndex + 1;
            if (rank > TOP_DISPLAY_LIMIT + 1) lines.push(TOP_RANK_GAP_SEPARATOR);
            lines.push(formatEntry(rank, scanned[viewerIndex], unit, true));
        }
    }

    const description = lines.length ? lines.join("\n") : t("top.no_entries", lang);

    return new EmbedBuilder()
        .setTitle(t("top.title", lang, {
            emoji: TOP_CATEGORY_EMOJI[category],
            category: t(`top.category_${category}`, lang),
            period: t(`top.period_${period}`, lang),
            guild: guild.name,
        }))
        .setDescription(description)
        .setColor(COLORS.activity)
        .setTimestamp();
}
