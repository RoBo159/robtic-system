export type TopCategory =
    | "messages-xp"
    | "voice-xp"
    | "streak"
    | "combo"
    | "points"
    | "quests"
    | "messages"
    | "voice"
    | "xp"
    | "coins";

export const TOP_CATEGORIES: TopCategory[] = [
    "messages-xp",
    "voice-xp",
    "streak",
    "combo",
    "points",
    "quests",
    "messages",
    "voice",
    "xp",
    "coins",
];

/**
 * What a bare `/top` shows, one page at a time.
 *
 * Three boards a page at most: any more and each one loses the rows that make it worth reading.
 * The order is deliberate — the two XP boards lead because "who is most active" is the question
 * people actually open this for, and the raw counters trail because they answer the same question
 * less well.
 *
 * `xp` (chat and voice combined) and `coins` are reachable by name but not on a page: the split
 * boards say more, and coins is a global wallet that has nothing to do with this server.
 */
export const TOP_PAGES: readonly (readonly TopCategory[])[] = [
    ["messages-xp", "voice-xp"],
    ["streak", "combo", "points"],
    ["quests", "messages", "voice"],
];

/** Emoji shown in each leaderboard's title. */
export const TOP_CATEGORY_EMOJI: Record<TopCategory, string> = {
    "messages-xp": "⭐",
    "voice-xp": "🎧",
    streak: "🔥",
    combo: "💬",
    points: "🎯",
    quests: "🗺️",
    messages: "📨",
    voice: "🎙️",
    xp: "📈",
    coins: "🪙",
};

/** Ranks shown per category on a `/top` page. */
export const TOP_DISPLAY_LIMIT = 5;

/** Ranks shown per page when one category is asked for by name — `/top combo`. */
export const TOP_DETAIL_LIMIT = 10;

/** Overview value, meaning "every category at once" rather than one of them. */
export const TOP_ALL_CATEGORIES = "all";

/**
 * How far to scan for the viewer's own rank when they are outside the shown page.
 *
 * A cap rather than a count query: past a hundred the exact number stops meaning much, and the
 * board says "not ranked" instead of paying for a scan nobody reads.
 */
export const VIEWER_RANK_SCAN_LIMIT = 100;

/** Separator inserted when the viewer's rank is far below the displayed top. */
export const TOP_RANK_GAP_SEPARATOR = "…";

/** Lookback windows for period-scoped streak leaderboards. */
export const TOP_PERIOD_TO_DAYS: Record<"weekly" | "monthly", number> = { weekly: 7, monthly: 30 };

/** Maximum autocomplete suggestions returned by the Activity's profile search. */
export const PROFILE_SEARCH_LIMIT = 8;

/** Rows returned per page by the Activity's leaderboard view. */
export const ACTIVITY_LEADERBOARD_LIMIT = 10;
