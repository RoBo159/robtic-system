export interface ClaimIntrusionTracker {
    count: number;
    warned: boolean;
    startedAt: number;
}

/** Per staff-and-channel counters for messages sent into sessions claimed by someone else. */
export const claimIntrusionCounters = new Map<string, ClaimIntrusionTracker>();
