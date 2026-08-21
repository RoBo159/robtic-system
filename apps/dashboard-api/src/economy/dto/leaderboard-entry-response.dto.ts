/**
 * One row of the coin leaderboard.
 *
 * `rank` is assigned by the server rather than left to the client to count, so ties and any future
 * ranking rule have exactly one implementation.
 */
export interface LeaderboardEntryResponse {
    rank: number;
    userId: string;
    username: string;
    coins: number;
}
