import type { LeaderboardResponse, LeaderboardRow } from "@typings/profile";
import { ActivityRepository, UserRepository } from "@database/repositories";
import {
    ACTIVITY_LEADERBOARD_LIMIT,
    VIEWER_RANK_SCAN_LIMIT,
    type ComboLeaderboardPeriod,
    type TopCategory,
} from "@constants";
import { getTopEntries } from "./get-top-entries";

/**
 * Leaderboard rows labelled with usernames/display names, plus the viewer's own row even when they
 * rank below the returned page — the Activity always shows "where you stand". Paginated so the
 * Activity can walk through every ranked member.
 */
export async function getLeaderboardPage(
    guildId: string,
    category: TopCategory,
    period: ComboLeaderboardPeriod,
    viewerId: string,
    page = 1,
    pageSize = ACTIVITY_LEADERBOARD_LIMIT,
): Promise<LeaderboardResponse> {
    const offset = (page - 1) * pageSize;
    const ranked = await getTopEntries(guildId, category, period, offset + pageSize + 1);
    const hasMore = ranked.length > offset + pageSize;
    const entries = ranked.slice(offset, offset + pageSize);

    const viewerInPage = entries.some(e => e.discordId === viewerId);
    const scanned = viewerInPage
        ? ranked
        : await getTopEntries(guildId, category, period, VIEWER_RANK_SCAN_LIMIT);
    const viewerIndex = scanned.findIndex(e => e.discordId === viewerId);

    const idsToLabel = [...new Set([
        ...entries.map(e => e.discordId),
        ...(viewerIndex === -1 ? [] : [viewerId]),
    ])];

    const activityRecords = await ActivityRepository.findManyByDiscordIds(guildId, idsToLabel);
    const usernameById = new Map(activityRecords.map(r => [r.discordId, r.username]));

    const toRow = async (discordId: string, value: number, rank: number): Promise<LeaderboardRow> => {
        const username = usernameById.get(discordId) ?? discordId;
        return {
            discordId,
            username,
            displayName: await UserRepository.getDisplayName(discordId) ?? username,
            avatarUrl: null,
            value,
            rank,
        };
    };

    const rows = await Promise.all(entries.map((e, i) => toRow(e.discordId, e.value, offset + i + 1)));

    const viewer = viewerIndex === -1
        ? null
        : rows.find(r => r.discordId === viewerId)
            ?? await toRow(viewerId, scanned[viewerIndex].value, viewerIndex + 1);

    return { category, period, rows, viewer, page, pageSize, hasMore };
}
