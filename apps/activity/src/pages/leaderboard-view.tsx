import { useEffect, useState } from "react";
import type { LeaderboardResponse, LeaderboardRow, TopCategory, TopPeriod } from "../types/profile";
import { fetchLeaderboard } from "../services/api/api-client";
import { Avatar } from "../components/avatar";
import { Icon, type IconName } from "../components/icon";
import { formatNumber, formatSeconds } from "../utils/format";

const CATEGORIES: { value: TopCategory; label: string; icon: IconName }[] = [
    { value: "streak", label: "Streak", icon: "fire" },
    { value: "combo", label: "Combo", icon: "message" },
    { value: "xp", label: "XP", icon: "zap" },
    { value: "messages", label: "Messages", icon: "activity" },
    { value: "voice", label: "Voice", icon: "mic" },
    { value: "points", label: "Points", icon: "star" },
    { value: "coins", label: "Coins", icon: "coin" },
    { value: "quests", label: "Quests", icon: "check" },
];

/** Voice ranks on seconds of active time, so raw numbers would be unreadable. */
const DURATION_CATEGORIES = new Set<TopCategory>(["voice"]);

const PERIODS: { value: TopPeriod; label: string }[] = [
    { value: "daily", label: "Today" },
    { value: "weekly", label: "Week" },
    { value: "monthly", label: "Month" },
    { value: "alltime", label: "All time" },
];

const MEDALS = ["🥇", "🥈", "🥉"];

const PAGE_SIZES = [10, 25, 50];

interface RowProps {
    row: LeaderboardRow;
    isViewer: boolean;
    category: TopCategory;
    onSelect: (id: string) => void;
}

function Row({ row, isViewer, category, onSelect }: RowProps) {
    const value = DURATION_CATEGORIES.has(category) ? formatSeconds(row.value) : formatNumber(row.value);

    return (
        <li>
            <button
                type="button"
                className={`row${isViewer ? " row--viewer" : ""}`}
                onClick={() => onSelect(row.discordId)}
            >
                <span className="row__rank">{MEDALS[row.rank - 1] ?? row.rank}</span>
                <Avatar src={row.avatarUrl} name={row.displayName} seed={row.discordId} size={32} />
                <span className="row__name">{row.displayName}</span>
                <span className="row__value">{value}</span>
            </button>
        </li>
    );
}

export function LeaderboardView({ onSelectUser }: { onSelectUser: (userId: string) => void }) {
    const [category, setCategory] = useState<TopCategory>("streak");
    const [period, setPeriod] = useState<TopPeriod>("alltime");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [data, setData] = useState<LeaderboardResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Changing what is ranked (or how many rows per page) starts back at page 1.
    function changeFilters(update: () => void) {
        setPage(1);
        update();
    }

    useEffect(() => {
        let cancelled = false;
        setData(null);
        setError(null);

        fetchLeaderboard(category, period, page, pageSize)
            .then((result) => { if (!cancelled) setData(result); })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            });

        return () => { cancelled = true; };
    }, [category, period, page, pageSize]);

    const viewerInRows = data?.viewer
        ? data.rows.some((row) => row.discordId === data.viewer!.discordId)
        : false;
    const showViewerGap = Boolean(data?.viewer) && !viewerInRows;

    return (
        <>
            <div className="filters">
                {CATEGORIES.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className="chip"
                        aria-pressed={category === option.value}
                        onClick={() => changeFilters(() => setCategory(option.value))}
                    >
                        <Icon name={option.icon} size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                        {option.label}
                    </button>
                ))}
            </div>

            <div className="filters">
                {PERIODS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className="chip"
                        aria-pressed={period === option.value}
                        onClick={() => changeFilters(() => setPeriod(option.value))}
                    >
                        {option.label}
                    </button>
                ))}

                <span className="filters__spacer" />
                <select
                    className="page-size"
                    value={pageSize}
                    aria-label="Users per page"
                    onChange={(event) => changeFilters(() => setPageSize(Number(event.target.value)))}
                >
                    {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} / page</option>)}
                </select>
            </div>

            {error && <p className="error">{error}</p>}
            {!error && !data && <div className="spinner" aria-label="Loading leaderboard" />}

            {data && (
                data.rows.length === 0 ? (
                    <p className="muted">{page > 1 ? "No more members on this page." : "No entries for this period yet."}</p>
                ) : (
                    <ul className="rows">
                        {data.rows.map((row) => (
                            <Row
                                key={row.discordId}
                                row={row}
                                isViewer={row.discordId === data.viewer?.discordId}
                                category={data.category}
                                onSelect={onSelectUser}
                            />
                        ))}

                        {showViewerGap && (
                            <>
                                <li className="row__gap">···</li>
                                <Row row={data.viewer!} isViewer category={data.category} onSelect={onSelectUser} />
                            </>
                        )}
                    </ul>
                )
            )}

            {data && (data.hasMore || page > 1) && (
                <div className="pager">
                    <button
                        type="button"
                        className="ghost-button"
                        disabled={page === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        <Icon name="chevron-left" size={14} style={{ verticalAlign: "-2px" }} /> Prev
                    </button>
                    <span className="pager__page">Page {data.page}</span>
                    <button
                        type="button"
                        className="ghost-button"
                        disabled={!data.hasMore}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next <Icon name="chevron-right" size={14} style={{ verticalAlign: "-2px" }} />
                    </button>
                </div>
            )}
        </>
    );
}
