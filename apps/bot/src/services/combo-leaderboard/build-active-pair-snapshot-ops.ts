import type { ICombo } from "@database/models";
import type { ComboLeaderboardUpsert } from "@database/repositories";
import { COMBO_LEADERBOARD_PERIODS } from "@constants";
import { periodKeyFor } from "@utils";

/** Builds one batch of $max upserts for every currently-active pair — called once per scheduler tick, never per-message. */
export function buildActivePairSnapshotOps(guildId: string, pairs: ICombo[], now: Date): ComboLeaderboardUpsert[] {
    const ops: ComboLeaderboardUpsert[] = [];
    for (const pair of pairs) {
        for (const userId of [pair.userLowId, pair.userHighId]) {
            for (const period of COMBO_LEADERBOARD_PERIODS) {
                const periodKey = periodKeyFor(period, now);
                ops.push({ guildId, period, periodKey, type: "combo", discordId: userId, value: pair.currentScore });
                ops.push({ guildId, period, periodKey, type: "streak", discordId: userId, value: pair.streakCurrent });
            }
        }
    }
    return ops;
}
