export interface QuestMissionResponse {
    label: string;
    metric: string;
    target: number;
}

/** One open quest on the board — the same board members see, without opening Discord. */
export interface QuestBoardEntryResponse {
    id: string;
    tier: string;
    status: string;
    reward: number;
    missions: QuestMissionResponse[];
    /** Null for an unlimited tier, which the board renders as "no cap" rather than as a number nobody set. */
    slotsTotal: number | null;
    slotsTaken: number;
    slotsRemaining: number;
    completionCount: number;
    endsAt: Date;
    channelId: string | null;
    messageId: string | null;
}
