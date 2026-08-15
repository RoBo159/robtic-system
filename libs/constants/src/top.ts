export type TopCategory = "streak" | "combo" | "xp" | "messages" | "voice" | "points" | "coins";

export const TOP_CATEGORIES: TopCategory[] = ["streak", "combo", "xp", "messages", "voice", "points", "coins"];

/** Emoji shown in each leaderboard's title. */
export const TOP_CATEGORY_EMOJI: Record<TopCategory, string> = {
    streak: "🔥",
    combo: "💬",
    xp: "⭐",
    messages: "📨",
    voice: "🎙️",
    points: "🎯",
    coins: "🪙",
};

/** Ranks shown per category in the combined `/top` overview. */
export const TOP_DISPLAY_LIMIT = 5;

/** Ranks shown when one category is asked for by name — `/top combo`. */
export const TOP_DETAIL_LIMIT = 10;

/** Overview value, meaning "every category at once" rather than one of them. */
export const TOP_ALL_CATEGORIES = "all";

/** How far to scan for the viewer's own rank when outside the top 5. */
export const VIEWER_RANK_SCAN_LIMIT = 100;

/** Separator inserted when the viewer's rank is far below the displayed top. */
export const TOP_RANK_GAP_SEPARATOR = "....";

/** Lookback windows for period-scoped streak leaderboards. */
export const TOP_PERIOD_TO_DAYS: Record<"weekly" | "monthly", number> = { weekly: 7, monthly: 30 };

/** Maximum autocomplete suggestions returned by the Activity's profile search. */
export const PROFILE_SEARCH_LIMIT = 8;

/** Rows returned per page by the Activity's leaderboard view. */
export const ACTIVITY_LEADERBOARD_LIMIT = 10;
