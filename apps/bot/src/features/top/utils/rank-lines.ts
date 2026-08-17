import { TOP_RANK_GAP_SEPARATOR, VIEWER_RANK_SCAN_LIMIT, type ComboLeaderboardPeriod, type TopCategory } from "@constants";
import type { TopEntry } from "@typings/top";
import { getTopEntries } from "../lib";
import { formatTopValue } from "./format-value";

export interface RankPage {
    lines: string[];
    /** The viewer's 1-based rank, 0 when they are unranked or beyond the scan limit. */
    viewerRank: number;
}

/**
 * One page of a leaderboard, with the reader's own row always visible.
 *
 * The rule, in the three shapes it takes:
 *
 * ```
 * inside the page      6th of a top 5          40th of a top 5
 * 1.                   1.                      1.
 * 2.                   2.                      2.
 * **3.**               …                       3.
 * 4.                   5.                      4.
 * 5.                   **6.**                  5.
 *                                              …
 *                                              **40.**
 * ```
 *
 * The separator is what makes the third shape honest: without it, rank 40 sitting under rank 5
 * reads as rank 6. It is deliberately absent when the viewer is the very next rank, because there
 * is nothing being skipped over.
 */
export async function buildRankPage(
    guildId: string,
    category: TopCategory,
    period: ComboLeaderboardPeriod,
    unit: string,
    options: {
        /** 0-based. Page 1 of a detail board is ranks 11-20. */
        page?: number;
        pageSize: number;
        viewerId?: string;
    },
): Promise<RankPage> {
    const { page = 0, pageSize, viewerId } = options;
    const offset = page * pageSize;

    // One read covers the page and the viewer's rank: the scan limit is the same list, just longer.
    const scanned = await getTopEntries(guildId, category, period, Math.max(offset + pageSize, VIEWER_RANK_SCAN_LIMIT));
    const slice = scanned.slice(offset, offset + pageSize);

    const viewerIndex = viewerId ? scanned.findIndex(entry => entry.discordId === viewerId) : -1;
    const viewerRank = viewerIndex === -1 ? 0 : viewerIndex + 1;

    const lines = slice.map((entry, index) =>
        formatRow(offset + index + 1, entry, category, unit, entry.discordId === viewerId));

    const onThisPage = viewerRank > offset && viewerRank <= offset + slice.length;

    if (viewerRank > 0 && !onThisPage && viewerRank > offset) {
        // Only ever appended *below* the page: a viewer ranked above it is already visible on the
        // page they came from, and repeating them there would be noise.
        if (viewerRank > offset + slice.length + 1) lines.push(TOP_RANK_GAP_SEPARATOR);
        lines.push(formatRow(viewerRank, scanned[viewerIndex]!, category, unit, true));
    }

    return { lines, viewerRank };
}

function formatRow(rank: number, entry: TopEntry, category: TopCategory, unit: string, isViewer: boolean): string {
    const line = `${rank}. <@${entry.discordId}> — ${formatTopValue(category, entry.value, unit)}`;
    return isViewer ? `**${line}**` : line;
}
