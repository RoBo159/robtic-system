export interface StaffChatTracker {
    staffIds: Set<string>;
    count: number;
    warned: boolean;
    startedAt: number;
}

/** Per-channel counters for staff-to-staff chatter in support channels. */
export const staffChatCounters = new Map<string, StaffChatTracker>();
