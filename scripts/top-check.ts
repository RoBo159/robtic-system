/**
 * Verifies the leaderboard's rank rendering and its page layout.
 *
 * The bold-and-ellipsis rule is the part worth testing: it has three shapes, two of them only
 * appear for people outside the top five, and getting the separator wrong makes rank 40 read as
 * rank 6 — a bug nobody would report because it looks like a working list.
 */
import { mock } from "bun:test";

// The board is stubbed rather than read from Mongo: this is about the rendering rules, and a fake
// ranking lets a "40th place" case exist without inventing forty members.
const ROSTER = Array.from({ length: 60 }, (_, i) => ({ discordId: `u${i + 1}`, value: 1000 - i }));

mock.module("@core/leaderboard", () => ({
    getTopEntries: async (_g: string, _c: string, _p: string, limit: number) => ROSTER.slice(0, limit),
    getStreakTopEntries: async () => [],
}));

const { buildRankPage } = await import("@bot/features/top/utils/rank-lines");
const { TOP_PAGES, TOP_CATEGORIES, TOP_DISPLAY_LIMIT, TOP_DETAIL_LIMIT, TOP_CATEGORY_EMOJI } = await import("@constants");

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

const page = (viewer: string | undefined, size: number, index = 0) =>
    buildRankPage("guild", "messages-xp", "daily", "XP", { page: index, pageSize: size, viewerId: viewer });

const bold = (line: string) => line.startsWith("**");
const rankOf = (line: string) => Number(line.replace(/\*/g, "").split(".")[0]);

// 1. Inside the page: bold in place, nothing appended.
{
    const { lines, viewerRank } = await page("u3", TOP_DISPLAY_LIMIT);
    check("a top-5 viewer is bolded in place", lines.length === 5 && bold(lines[2]!) && rankOf(lines[2]!) === 3);
    check("nothing is appended for a listed viewer", lines.filter(bold).length === 1, `${lines.length} lines`);
    check("the rank is reported", viewerRank === 3, `${viewerRank}`);
}

// 2. Exactly one past the page: appended, no separator.
{
    const { lines } = await page("u6", TOP_DISPLAY_LIMIT);
    check("rank 6 is appended below a top 5", lines.length === 6 && bold(lines[5]!) && rankOf(lines[5]!) === 6);
    check("no separator when nothing is skipped", !lines.includes("…"), lines[4] ?? "");
}

// 3. Far below: separator, then the viewer.
{
    const { lines } = await page("u40", TOP_DISPLAY_LIMIT);
    check("a distant viewer gets a separator", lines[5] === "…", lines[5] ?? "");
    check("and their own bold row last", bold(lines[6]!) && rankOf(lines[6]!) === 40, lines[6] ?? "");
    check("the top five are still intact", lines.slice(0, 5).map(rankOf).join(",") === "1,2,3,4,5");
}

// 4. Unranked and anonymous readers.
{
    const { lines, viewerRank } = await page("nobody", TOP_DISPLAY_LIMIT);
    check("an unranked viewer adds nothing", lines.length === 5 && viewerRank === 0);

    const anonymous = await page(undefined, TOP_DISPLAY_LIMIT);
    check("no viewer means no bold row", anonymous.lines.every(l => !bold(l)));
}

// 5. Detail pages walk the ranking ten at a time.
{
    const first = await page("u40", TOP_DETAIL_LIMIT, 0);
    check("detail page 1 is ranks 1-10", first.lines.slice(0, 10).map(rankOf).join(",") === "1,2,3,4,5,6,7,8,9,10");

    const fourth = await page("u40", TOP_DETAIL_LIMIT, 3);
    check("detail page 4 is ranks 31-40", fourth.lines.map(rankOf).slice(0, 10).join(",") === "31,32,33,34,35,36,37,38,39,40");
    check("the viewer is bold on the page they fall on", fourth.lines.some(l => bold(l) && rankOf(l) === 40));
    check("and not repeated below it", fourth.lines.filter(bold).length === 1);
}

// 6. A viewer above the current page is not dragged down onto it.
{
    const { lines } = await page("u2", TOP_DETAIL_LIMIT, 2);
    check("a viewer ranked above the page is left off it", lines.every(l => rankOf(l) >= 21 || l === "…"), lines[lines.length - 1] ?? "");
}

// 7. The pages themselves.
{
    const flat = TOP_PAGES.flat();
    check("every paged category is a real category", flat.every(c => TOP_CATEGORIES.includes(c)), flat.join(", "));
    check("no category is on two pages", new Set(flat).size === flat.length);
    check("no page holds more than three boards", TOP_PAGES.every(p => p.length <= 3), TOP_PAGES.map(p => p.length).join("/"));
    check("every category has an emoji", TOP_CATEGORIES.every(c => Boolean(TOP_CATEGORY_EMOJI[c])));
    console.log(`      pages: ${TOP_PAGES.map(p => p.join(" | ")).join("  →  ")}`);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
