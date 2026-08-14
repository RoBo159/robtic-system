import { utcDateKey } from "@utils";

export interface ConversationStreakRoll {
    streakCurrent: number;
    streakBest: number;
    dateKey: string;
}

/**
 * Rolls a pair's Conversation Streak forward for a conversation ending now. Consecutive calendar
 * days (UTC) increment the streak; any gap resets it to 1; the same day is a no-op (a pair can only
 * advance its streak once per day, no matter how many separate combos they have that day).
 */
export function rollConversationStreak(
    previousStreakCurrent: number,
    previousStreakBest: number,
    previousDateKey: string,
    now: Date = new Date(),
): ConversationStreakRoll {
    const todayKey = utcDateKey(now);
    if (previousDateKey === todayKey) {
        return { streakCurrent: previousStreakCurrent, streakBest: previousStreakBest, dateKey: previousDateKey };
    }

    const yesterdayKey = utcDateKey(new Date(now.getTime() - 86_400_000));
    const streakCurrent = previousDateKey === yesterdayKey ? previousStreakCurrent + 1 : 1;
    const streakBest = Math.max(previousStreakBest, streakCurrent);

    return { streakCurrent, streakBest, dateKey: todayKey };
}
